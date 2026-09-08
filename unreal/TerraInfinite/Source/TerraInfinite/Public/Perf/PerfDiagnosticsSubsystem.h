// Frame-time statistics (current / average / 1 % low FPS), memory + VRAM via RHI stats, active streaming cells,
// actors, draw calls; a hardware probe (CPU/GPU/RAM/VRAM/resolution/RHI); a benchmark runner that visits spawn
// points and writes Saved/Benchmarks/<timestamp>.json; and the quality governor that walks the degradation ladder.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "PerfDiagnosticsSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FTerraHardwareProbe
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Cpu;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 CpuCores = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 CpuThreads = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Gpu;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Rhi;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString FeatureLevel;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float RamGb = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float VramGb = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FIntPoint Resolution = FIntPoint::ZeroValue;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Os;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString EngineVersion;
};

USTRUCT(BlueprintType)
struct FTerraPerfSnapshot
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float FpsCurrent = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float FpsAverage = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float FpsOnePercentLow = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float FrameMs = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float GameThreadMs = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float RenderThreadMs = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float GpuMs = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float UsedPhysicalMb = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float UsedVirtualMb = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float VramUsedMb = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float VramTotalMb = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 DrawCalls = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 PrimitivesDrawn = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Actors = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 ActiveCells = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 PendingCells = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Interiors = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float ScreenPercentage = 100.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString QualityPreset;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 GovernorRung = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double PlayerLat = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double PlayerLon = 0.0;
};

UCLASS()
class TERRAINFINITE_API UPerfDiagnosticsSubsystem : public UTickableWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Tick(float DeltaTime) override;
    virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UPerfDiagnosticsSubsystem, STATGROUP_Tickables); }
    virtual bool IsTickable() const override { return !IsTemplate() && GetWorld() && GetWorld()->IsGameWorld(); }

    UFUNCTION(BlueprintPure, Category = "Terra|Perf") FTerraPerfSnapshot GetSnapshot() const { return Snapshot; }
    UFUNCTION(BlueprintPure, Category = "Terra|Perf") FTerraHardwareProbe GetHardware() const { return Hardware; }
    UFUNCTION(BlueprintCallable, Category = "Terra|Perf") void ToggleOverlay();
    UFUNCTION(BlueprintPure, Category = "Terra|Perf") bool IsOverlayVisible() const { return bOverlay; }

    /** Starts the benchmark: visits each spawn id for DurationSeconds, then writes the JSON. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Perf") bool RunBenchmark(const TArray<FString>& SpawnIds, int32 DurationSeconds);
    UFUNCTION(BlueprintPure, Category = "Terra|Perf") bool IsBenchmarkRunning() const { return bBenchmark; }
    /** Writes the current window (no benchmark needed) and returns the file path. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Perf") FString WriteBenchmarkJson(const FString& Label);

    /** Reset the 1 % low / average window (called when teleporting). */
    UFUNCTION(BlueprintCallable, Category = "Terra|Perf") void ResetWindow();

private:
    struct FBenchmarkLeg
    {
        FString SpawnId;
        FString Label;
        double Lat = 0.0, Lon = 0.0;
        float FpsAverage = 0.0f, FpsOnePercentLow = 0.0f, FrameMsMax = 0.0f;
        float VramUsedMb = 0.0f, UsedPhysicalMb = 0.0f;
        int32 DrawCallsAvg = 0, ActorsAvg = 0, CellsAvg = 0;
        int32 Frames = 0;
    };

    void ProbeHardware();
    void UpdateFrameStats(float DeltaTime);
    void UpdateMemoryStats();
    void UpdateSceneStats();
    void UpdateGovernor(float DeltaTime);
    void EngageRung(int32 Rung);
    void ReleaseRung(int32 Rung);
    void DrawOverlay();
    void TickBenchmark(float DeltaTime);
    void FinishLeg();
    void StartLeg(int32 Index);

    FTerraPerfSnapshot Snapshot;
    FTerraHardwareProbe Hardware;
    TArray<float> FrameTimesMs;   // ring buffer, last ~10 s
    int32 FrameCursor = 0;
    bool bRingFull = false;
    float SortScratchAccumulator = 0.0f;
    float MemoryAccumulator = 0.0f;
    bool bOverlay = false;

    // governor
    int32 GovernorRung = 0;
    float BelowTargetSeconds = 0.0f;
    float AboveTargetSeconds = 0.0f;
    TArray<TArray<TPair<FString, FString>>> RungPreviousValues;

    // benchmark
    bool bBenchmark = false;
    TArray<FString> BenchmarkSpawnIds;
    int32 BenchmarkLeg = -1;
    float BenchmarkLegSeconds = 0.0f;
    float BenchmarkDuration = 60.0f;
    TArray<FBenchmarkLeg> BenchmarkResults;
    double LegDrawCallsSum = 0.0, LegActorsSum = 0.0, LegCellsSum = 0.0;
    int32 LegFrames = 0;
    float LegFrameMsMax = 0.0f;
};
