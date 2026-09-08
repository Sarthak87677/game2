#include "Perf/PerfDiagnosticsSubsystem.h"
#include "TerraInfinite.h"
#include "Core/TerraGameMode.h"
#include "Core/TerraGameSettings.h"
#include "Interiors/InteriorGeneratorSubsystem.h"
#include "Scalability/TerraScalability.h"
#include "Streaming/GeoStreamingSubsystem.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "HAL/IConsoleManager.h"
#include "HAL/PlatformMemory.h"
#include "HAL/PlatformMisc.h"
#include "Misc/App.h"
#include "Misc/DateTime.h"
#include "Misc/EngineVersion.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "RHI.h"
#include "RHIStats.h"
#include "RenderCore.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "UnrealClient.h"
#include "Kismet/GameplayStatics.h"

static TAutoConsoleVariable<float> CVarTargetFps(TEXT("terra.Perf.TargetFps"), 60.0f, TEXT("Quality governor target FPS."));

static FAutoConsoleCommandWithWorldAndArgs GTerraBenchmarkRunCmd(
    TEXT("terra.Benchmark.Run"),
    TEXT("terra.Benchmark.Run [spawnId ...] [duration=N] - visit spawn points and write Saved/Benchmarks/*.json"),
    FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
    {
        UPerfDiagnosticsSubsystem* Perf = World ? World->GetSubsystem<UPerfDiagnosticsSubsystem>() : nullptr;
        if (!Perf) return;
        TArray<FString> Ids;
        int32 Duration = UTerraGameSettings::Get()->BenchmarkDurationSeconds;
        for (const FString& A : Args)
        {
            if (A.StartsWith(TEXT("duration="))) Duration = FCString::Atoi(*A.Mid(9));
            else Ids.Add(A);
        }
        if (Ids.Num() == 0)
        {
            UTerraGameSettings::Get()->BenchmarkSpawnIds.ParseIntoArray(Ids, TEXT(","), true);
        }
        Perf->RunBenchmark(Ids, Duration);
    }));

static FAutoConsoleCommandWithWorldAndArgs GTerraBenchmarkWriteCmd(
    TEXT("terra.Benchmark.Write"),
    TEXT("terra.Benchmark.Write [label] - write the current stats window to Saved/Benchmarks/*.json"),
    FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
    {
        if (UPerfDiagnosticsSubsystem* Perf = World ? World->GetSubsystem<UPerfDiagnosticsSubsystem>() : nullptr)
        {
            Perf->WriteBenchmarkJson(Args.Num() ? Args[0] : TEXT("manual"));
        }
    }));

static FAutoConsoleCommandWithWorld GTerraOverlayCmd(
    TEXT("terra.Diagnostics"), TEXT("Toggle the Terra diagnostics overlay."),
    FConsoleCommandWithWorldDelegate::CreateLambda([](UWorld* World)
    {
        if (UPerfDiagnosticsSubsystem* Perf = World ? World->GetSubsystem<UPerfDiagnosticsSubsystem>() : nullptr) Perf->ToggleOverlay();
    }));

void UPerfDiagnosticsSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    FrameTimesMs.Init(0.0f, 600); // ~10 s at 60 FPS
    ProbeHardware();
    const UTerraScalabilitySettings* S = GetDefault<UTerraScalabilitySettings>();
    RungPreviousValues.SetNum(S->DegradationLadder.Num());
    UE_LOG(LogTerra, Log, TEXT("Hardware: %s (%d cores) | %s via %s | RAM %.1f GB | VRAM %.1f GB | %dx%d | %s"),
        *Hardware.Cpu, Hardware.CpuCores, *Hardware.Gpu, *Hardware.Rhi, Hardware.RamGb, Hardware.VramGb, Hardware.Resolution.X, Hardware.Resolution.Y, *Hardware.EngineVersion);
}

void UPerfDiagnosticsSubsystem::ProbeHardware()
{
    Hardware.Cpu = FPlatformMisc::GetCPUBrand();
    Hardware.CpuCores = FPlatformMisc::NumberOfCores();
    Hardware.CpuThreads = FPlatformMisc::NumberOfCoresIncludingHyperthreads();
    Hardware.Gpu = GRHIAdapterName;
    Hardware.Rhi = GDynamicRHI ? FString(GDynamicRHI->GetName()) : TEXT("none");
    Hardware.FeatureLevel = LexToString(GMaxRHIFeatureLevel);
    Hardware.RamGb = static_cast<float>(FPlatformMemory::GetPhysicalGBRam());
    FTextureMemoryStats TexStats;
    RHIGetTextureMemoryStats(TexStats);
    const int64 VramBytes = TexStats.DedicatedVideoMemory > 0 ? TexStats.DedicatedVideoMemory : TexStats.TotalGraphicsMemory;
    Hardware.VramGb = VramBytes > 0 ? static_cast<float>(VramBytes) / (1024.0f * 1024.0f * 1024.0f) : 0.0f;
    Hardware.Resolution = FIntPoint(GSystemResolution.ResX, GSystemResolution.ResY);
    Hardware.Os = FPlatformMisc::GetOSVersion();
    Hardware.EngineVersion = FEngineVersion::Current().ToString();
}

void UPerfDiagnosticsSubsystem::ResetWindow()
{
    for (float& F : FrameTimesMs) F = 0.0f;
    FrameCursor = 0;
    bRingFull = false;
}

void UPerfDiagnosticsSubsystem::UpdateFrameStats(float DeltaTime)
{
    const float Ms = DeltaTime * 1000.0f;
    FrameTimesMs[FrameCursor] = Ms;
    FrameCursor = (FrameCursor + 1) % FrameTimesMs.Num();
    if (FrameCursor == 0) bRingFull = true;
    Snapshot.FrameMs = Ms;
    Snapshot.FpsCurrent = Ms > 0.0f ? 1000.0f / Ms : 0.0f;

    // Average + 1 % low are recomputed 4x per second (sorting 600 floats is cheap but not free).
    SortScratchAccumulator += DeltaTime;
    if (SortScratchAccumulator >= 0.25f)
    {
        SortScratchAccumulator = 0.0f;
        const int32 N = bRingFull ? FrameTimesMs.Num() : FrameCursor;
        if (N > 10)
        {
            TArray<float> Sorted(FrameTimesMs.GetData(), N);
            Sorted.Sort();
            double Sum = 0.0;
            for (float F : Sorted) Sum += F;
            Snapshot.FpsAverage = static_cast<float>(1000.0 / (Sum / N));
            const int32 WorstCount = FMath::Max(1, N / 100);
            double WorstSum = 0.0;
            for (int32 i = 0; i < WorstCount; ++i) WorstSum += Sorted[N - 1 - i];
            Snapshot.FpsOnePercentLow = static_cast<float>(1000.0 / (WorstSum / WorstCount));
        }
    }
    Snapshot.GameThreadMs = FPlatformTime::ToMilliseconds(GGameThreadTime);
    Snapshot.RenderThreadMs = FPlatformTime::ToMilliseconds(GRenderThreadTime);
    Snapshot.GpuMs = FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles());
}

void UPerfDiagnosticsSubsystem::UpdateMemoryStats()
{
    const FPlatformMemoryStats Mem = FPlatformMemory::GetStats();
    Snapshot.UsedPhysicalMb = Mem.UsedPhysical / (1024.0f * 1024.0f);
    Snapshot.UsedVirtualMb = Mem.UsedVirtual / (1024.0f * 1024.0f);
    FTextureMemoryStats TexStats;
    RHIGetTextureMemoryStats(TexStats);
    // AllocatedMemorySize covers RHI resource allocations the driver reports; on D3D12 this is the local budget usage.
    Snapshot.VramUsedMb = TexStats.AllocatedMemorySize / (1024.0f * 1024.0f);
    const int64 Total = TexStats.DedicatedVideoMemory > 0 ? TexStats.DedicatedVideoMemory : TexStats.TotalGraphicsMemory;
    Snapshot.VramTotalMb = Total / (1024.0f * 1024.0f);
}

void UPerfDiagnosticsSubsystem::UpdateSceneStats()
{
    Snapshot.DrawCalls = GNumDrawCallsRHI[0];
    Snapshot.PrimitivesDrawn = GNumPrimitivesDrawnRHI[0];
    Snapshot.Actors = GetWorld()->GetActorCount();
    if (UGeoStreamingSubsystem* Streaming = GetWorld()->GetSubsystem<UGeoStreamingSubsystem>())
    {
        const FTerraStreamingStats S = Streaming->GetStats();
        Snapshot.ActiveCells = S.LoadedCells;
        Snapshot.PendingCells = S.PendingCells;
        Snapshot.PlayerLat = S.PlayerLat;
        Snapshot.PlayerLon = S.PlayerLon;
    }
    if (UInteriorGeneratorSubsystem* Interiors = GetWorld()->GetSubsystem<UInteriorGeneratorSubsystem>())
    {
        Snapshot.Interiors = Interiors->GetStats().Spawned;
    }
    Snapshot.ScreenPercentage = FCString::Atof(*UTerraScalabilityLibrary::GetCvar(TEXT("r.ScreenPercentage")));
    Snapshot.QualityPreset = UTerraScalabilityLibrary::GetActivePreset().ToString();
    Snapshot.GovernorRung = GovernorRung;
}

void UPerfDiagnosticsSubsystem::EngageRung(int32 Rung)
{
    const UTerraScalabilitySettings* S = GetDefault<UTerraScalabilitySettings>();
    if (!S->DegradationLadder.IsValidIndex(Rung)) return;
    TArray<TPair<FString, FString>> Cvars;
    UTerraScalabilityLibrary::ParseCvarList(S->DegradationLadder[Rung].Cvars, Cvars);
    RungPreviousValues[Rung].Reset();
    for (const auto& KV : Cvars)
    {
        RungPreviousValues[Rung].Emplace(KV.Key, UTerraScalabilityLibrary::GetCvar(KV.Key));
        UTerraScalabilityLibrary::SetCvar(KV.Key, KV.Value);
    }
    UE_LOG(LogTerra, Log, TEXT("Governor: engaged rung %d (%s) at %.0f FPS avg"), Rung + 1, *S->DegradationLadder[Rung].Name.ToString(), Snapshot.FpsAverage);
}

void UPerfDiagnosticsSubsystem::ReleaseRung(int32 Rung)
{
    if (!RungPreviousValues.IsValidIndex(Rung)) return;
    for (const auto& KV : RungPreviousValues[Rung])
    {
        UTerraScalabilityLibrary::SetCvar(KV.Key, KV.Value);
    }
    RungPreviousValues[Rung].Reset();
    UE_LOG(LogTerra, Log, TEXT("Governor: released rung %d at %.0f FPS avg"), Rung + 1, Snapshot.FpsAverage);
}

void UPerfDiagnosticsSubsystem::UpdateGovernor(float DeltaTime)
{
    const UTerraScalabilitySettings* S = GetDefault<UTerraScalabilitySettings>();
    if (!S->GovernorEnabled || bBenchmark || Snapshot.FpsAverage <= 0.0f)
    {
        return;
    }
    const float Target = CVarTargetFps.GetValueOnGameThread() > 0.0f ? CVarTargetFps.GetValueOnGameThread() : S->GovernorTargetFps;
    if (Snapshot.FpsAverage < Target - S->GovernorHysteresisFps)
    {
        BelowTargetSeconds += DeltaTime;
        AboveTargetSeconds = 0.0f;
        if (BelowTargetSeconds >= S->GovernorSecondsBelowTargetBeforeStep && GovernorRung < S->DegradationLadder.Num())
        {
            EngageRung(GovernorRung++);
            BelowTargetSeconds = 0.0f;
            ResetWindow();
        }
    }
    else if (Snapshot.FpsAverage > Target + S->GovernorHysteresisFps)
    {
        AboveTargetSeconds += DeltaTime;
        BelowTargetSeconds = 0.0f;
        if (AboveTargetSeconds >= S->GovernorSecondsAboveTargetBeforeRestore && GovernorRung > 0)
        {
            ReleaseRung(--GovernorRung);
            AboveTargetSeconds = 0.0f;
            ResetWindow();
        }
    }
    else
    {
        BelowTargetSeconds = AboveTargetSeconds = 0.0f;
    }
}

void UPerfDiagnosticsSubsystem::ToggleOverlay()
{
    bOverlay = !bOverlay;
}

void UPerfDiagnosticsSubsystem::DrawOverlay()
{
    if (!GEngine) return;
    const FColor C = Snapshot.FpsAverage >= 55.0f ? FColor::Green : Snapshot.FpsAverage >= 28.0f ? FColor::Yellow : FColor::Red;
    auto Line = [&](int32 Key, const FString& Text, FColor Colour = FColor::White)
    {
        GEngine->AddOnScreenDebugMessage(9000 + Key, 0.5f, Colour, Text);
    };
    Line(0, FString::Printf(TEXT("Terra | %.0f fps (avg %.0f, 1%% low %.0f) | %.1f ms  GT %.1f  RT %.1f  GPU %.1f"),
        Snapshot.FpsCurrent, Snapshot.FpsAverage, Snapshot.FpsOnePercentLow, Snapshot.FrameMs, Snapshot.GameThreadMs, Snapshot.RenderThreadMs, Snapshot.GpuMs), C);
    Line(1, FString::Printf(TEXT("RAM %.0f MB | VRAM %.0f / %.0f MB | draws %d | prims %d | actors %d"),
        Snapshot.UsedPhysicalMb, Snapshot.VramUsedMb, Snapshot.VramTotalMb, Snapshot.DrawCalls, Snapshot.PrimitivesDrawn, Snapshot.Actors));
    Line(2, FString::Printf(TEXT("cells %d (+%d pending) | interiors %d | %.5f, %.5f"), Snapshot.ActiveCells, Snapshot.PendingCells, Snapshot.Interiors, Snapshot.PlayerLat, Snapshot.PlayerLon));
    Line(3, FString::Printf(TEXT("preset %s | governor rung %d | screen %% %.0f | %s / %s"), *Snapshot.QualityPreset, Snapshot.GovernorRung, Snapshot.ScreenPercentage, *Hardware.Gpu, *Hardware.Rhi));
    if (bBenchmark)
    {
        Line(4, FString::Printf(TEXT("BENCHMARK leg %d/%d  %.0fs"), BenchmarkLeg + 1, BenchmarkSpawnIds.Num(), BenchmarkLegSeconds), FColor::Cyan);
    }
    Line(5, TEXT("Content is procedural / approximate unless labelled measured."), FColor::Silver);
}

bool UPerfDiagnosticsSubsystem::RunBenchmark(const TArray<FString>& SpawnIds, int32 DurationSeconds)
{
    if (bBenchmark || SpawnIds.Num() == 0)
    {
        return false;
    }
    bBenchmark = true;
    bOverlay = true;
    BenchmarkSpawnIds = SpawnIds;
    BenchmarkDuration = FMath::Max(5, DurationSeconds);
    BenchmarkResults.Reset();
    StartLeg(0);
    return true;
}

void UPerfDiagnosticsSubsystem::StartLeg(int32 Index)
{
    BenchmarkLeg = Index;
    BenchmarkLegSeconds = 0.0f;
    LegDrawCallsSum = LegActorsSum = LegCellsSum = 0.0;
    LegFrames = 0;
    LegFrameMsMax = 0.0f;
    if (ATerraGameMode* GM = Cast<ATerraGameMode>(GetWorld()->GetAuthGameMode()))
    {
        GM->SpawnPlayerAt(BenchmarkSpawnIds[Index]);
    }
    ResetWindow();
}

void UPerfDiagnosticsSubsystem::FinishLeg()
{
    FBenchmarkLeg Leg;
    Leg.SpawnId = BenchmarkSpawnIds[BenchmarkLeg];
    if (ATerraGameMode* GM = Cast<ATerraGameMode>(GetWorld()->GetAuthGameMode()))
    {
        Leg.Label = GM->GetCurrentSpawn().DisplayName;
        Leg.Lat = GM->GetCurrentSpawn().Lat;
        Leg.Lon = GM->GetCurrentSpawn().Lon;
    }
    Leg.FpsAverage = Snapshot.FpsAverage;
    Leg.FpsOnePercentLow = Snapshot.FpsOnePercentLow;
    Leg.FrameMsMax = LegFrameMsMax;
    Leg.VramUsedMb = Snapshot.VramUsedMb;
    Leg.UsedPhysicalMb = Snapshot.UsedPhysicalMb;
    Leg.Frames = LegFrames;
    Leg.DrawCallsAvg = LegFrames ? static_cast<int32>(LegDrawCallsSum / LegFrames) : 0;
    Leg.ActorsAvg = LegFrames ? static_cast<int32>(LegActorsSum / LegFrames) : 0;
    Leg.CellsAvg = LegFrames ? static_cast<int32>(LegCellsSum / LegFrames) : 0;
    BenchmarkResults.Add(Leg);
}

void UPerfDiagnosticsSubsystem::TickBenchmark(float DeltaTime)
{
    BenchmarkLegSeconds += DeltaTime;
    // Skip the first 5 s of each leg (streaming settle) in the per-leg aggregates.
    if (BenchmarkLegSeconds > 5.0f)
    {
        LegDrawCallsSum += Snapshot.DrawCalls;
        LegActorsSum += Snapshot.Actors;
        LegCellsSum += Snapshot.ActiveCells;
        LegFrameMsMax = FMath::Max(LegFrameMsMax, Snapshot.FrameMs);
        ++LegFrames;
    }
    if (BenchmarkLegSeconds >= BenchmarkDuration)
    {
        FinishLeg();
        if (BenchmarkLeg + 1 < BenchmarkSpawnIds.Num())
        {
            StartLeg(BenchmarkLeg + 1);
        }
        else
        {
            bBenchmark = false;
            const FString Path = WriteBenchmarkJson(TEXT("benchmark"));
            UE_LOG(LogTerra, Log, TEXT("Benchmark complete -> %s"), *Path);
        }
    }
}

FString UPerfDiagnosticsSubsystem::WriteBenchmarkJson(const FString& Label)
{
    TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
    Root->SetStringField(TEXT("label"), Label);
    Root->SetStringField(TEXT("generatedAt"), FDateTime::UtcNow().ToIso8601());
    Root->SetStringField(TEXT("project"), TEXT("Terra Infinite (Unreal client)"));
    Root->SetStringField(TEXT("note"), TEXT("Numbers from a real machine only; the cloud sandbox cannot run Unreal. Content is procedural/approximate."));

    TSharedRef<FJsonObject> HW = MakeShared<FJsonObject>();
    HW->SetStringField(TEXT("cpu"), Hardware.Cpu);
    HW->SetNumberField(TEXT("cpuCores"), Hardware.CpuCores);
    HW->SetNumberField(TEXT("cpuThreads"), Hardware.CpuThreads);
    HW->SetStringField(TEXT("gpu"), Hardware.Gpu);
    HW->SetStringField(TEXT("rhi"), Hardware.Rhi);
    HW->SetStringField(TEXT("featureLevel"), Hardware.FeatureLevel);
    HW->SetNumberField(TEXT("ramGb"), Hardware.RamGb);
    HW->SetNumberField(TEXT("vramGb"), Hardware.VramGb);
    HW->SetStringField(TEXT("resolution"), FString::Printf(TEXT("%dx%d"), Hardware.Resolution.X, Hardware.Resolution.Y));
    HW->SetStringField(TEXT("os"), Hardware.Os);
    HW->SetStringField(TEXT("engine"), Hardware.EngineVersion);
    Root->SetObjectField(TEXT("hardware"), HW);

    TSharedRef<FJsonObject> Q = MakeShared<FJsonObject>();
    Q->SetStringField(TEXT("preset"), Snapshot.QualityPreset);
    Q->SetNumberField(TEXT("governorRung"), Snapshot.GovernorRung);
    Q->SetNumberField(TEXT("screenPercentage"), Snapshot.ScreenPercentage);
    Root->SetObjectField(TEXT("quality"), Q);

    TSharedRef<FJsonObject> Now = MakeShared<FJsonObject>();
    Now->SetNumberField(TEXT("fpsCurrent"), Snapshot.FpsCurrent);
    Now->SetNumberField(TEXT("fpsAverage"), Snapshot.FpsAverage);
    Now->SetNumberField(TEXT("fpsOnePercentLow"), Snapshot.FpsOnePercentLow);
    Now->SetNumberField(TEXT("frameMs"), Snapshot.FrameMs);
    Now->SetNumberField(TEXT("gameThreadMs"), Snapshot.GameThreadMs);
    Now->SetNumberField(TEXT("renderThreadMs"), Snapshot.RenderThreadMs);
    Now->SetNumberField(TEXT("gpuMs"), Snapshot.GpuMs);
    Now->SetNumberField(TEXT("usedPhysicalMb"), Snapshot.UsedPhysicalMb);
    Now->SetNumberField(TEXT("vramUsedMb"), Snapshot.VramUsedMb);
    Now->SetNumberField(TEXT("vramTotalMb"), Snapshot.VramTotalMb);
    Now->SetNumberField(TEXT("drawCalls"), Snapshot.DrawCalls);
    Now->SetNumberField(TEXT("actors"), Snapshot.Actors);
    Now->SetNumberField(TEXT("activeCells"), Snapshot.ActiveCells);
    Now->SetNumberField(TEXT("interiors"), Snapshot.Interiors);
    Root->SetObjectField(TEXT("current"), Now);

    TArray<TSharedPtr<FJsonValue>> Legs;
    for (const FBenchmarkLeg& Leg : BenchmarkResults)
    {
        TSharedRef<FJsonObject> L = MakeShared<FJsonObject>();
        L->SetStringField(TEXT("spawnId"), Leg.SpawnId);
        L->SetStringField(TEXT("label"), Leg.Label);
        L->SetNumberField(TEXT("lat"), Leg.Lat);
        L->SetNumberField(TEXT("lon"), Leg.Lon);
        L->SetNumberField(TEXT("fpsAverage"), Leg.FpsAverage);
        L->SetNumberField(TEXT("fpsOnePercentLow"), Leg.FpsOnePercentLow);
        L->SetNumberField(TEXT("frameMsMax"), Leg.FrameMsMax);
        L->SetNumberField(TEXT("vramUsedMb"), Leg.VramUsedMb);
        L->SetNumberField(TEXT("usedPhysicalMb"), Leg.UsedPhysicalMb);
        L->SetNumberField(TEXT("drawCallsAvg"), Leg.DrawCallsAvg);
        L->SetNumberField(TEXT("actorsAvg"), Leg.ActorsAvg);
        L->SetNumberField(TEXT("cellsAvg"), Leg.CellsAvg);
        L->SetNumberField(TEXT("frames"), Leg.Frames);
        Legs.Add(MakeShared<FJsonValueObject>(L));
    }
    Root->SetArrayField(TEXT("legs"), Legs);

    FString Out;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
    FJsonSerializer::Serialize(Root, Writer);
    const FString Dir = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("Benchmarks"));
    const FString File = FPaths::Combine(Dir, FString::Printf(TEXT("%s-%s.json"), *Label, *FDateTime::UtcNow().ToString(TEXT("%Y%m%d-%H%M%S"))));
    if (!FFileHelper::SaveStringToFile(Out, *File))
    {
        UE_LOG(LogTerra, Error, TEXT("Could not write %s"), *File);
    }
    return File;
}

void UPerfDiagnosticsSubsystem::Tick(float DeltaTime)
{
    UpdateFrameStats(DeltaTime);
    MemoryAccumulator += DeltaTime;
    if (MemoryAccumulator >= 0.5f)
    {
        MemoryAccumulator = 0.0f;
        UpdateMemoryStats();
    }
    UpdateSceneStats();
    UpdateGovernor(DeltaTime);
    if (bBenchmark)
    {
        TickBenchmark(DeltaTime);
    }
    if (bOverlay)
    {
        DrawOverlay();
    }
}
