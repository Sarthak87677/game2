#include "Streaming/GeoStreamingSubsystem.h"
#include "TerraInfinite.h"
#include "Geo/TerraGeo.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "HAL/IConsoleManager.h"
#include "HAL/PlatformTime.h"
#include "Kismet/GameplayStatics.h"

static TAutoConsoleVariable<float> CVarCellSizeM(TEXT("terra.Streaming.CellSizeM"), 256.0f, TEXT("Gameplay content cell size in metres."));
static TAutoConsoleVariable<int32> CVarRadiusCells(TEXT("terra.Streaming.RadiusCells"), 6, TEXT("Cells loaded around the player (radius)."));
static TAutoConsoleVariable<int32> CVarMaxLoadsPerFrame(TEXT("terra.Streaming.MaxLoadsPerFrame"), 2, TEXT("Cell loads per frame."));
static TAutoConsoleVariable<float> CVarBudgetMs(TEXT("terra.Streaming.BudgetMs"), 2.0f, TEXT("Milliseconds per frame for cell loading."));

void UGeoStreamingSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    ReadCvars();
}

void UGeoStreamingSubsystem::Deinitialize()
{
    for (const auto& Pair : Loaded)
    {
        for (ITerraCellProducer* P : Producers)
        {
            P->OnCellUnload(Pair.Value);
        }
    }
    Loaded.Reset();
    Pending.Reset();
    Producers.Reset();
    Super::Deinitialize();
}

void UGeoStreamingSubsystem::ReadCvars()
{
    CellSizeM = FMath::Max(32.0, (double)CVarCellSizeM.GetValueOnGameThread());
    RadiusCells = FMath::Clamp(CVarRadiusCells.GetValueOnGameThread(), 1, 24);
    MaxLoadsPerFrame = FMath::Clamp(CVarMaxLoadsPerFrame.GetValueOnGameThread(), 1, 32);
    BudgetMs = FMath::Max(0.25, (double)CVarBudgetMs.GetValueOnGameThread());
}

void UGeoStreamingSubsystem::RegisterProducer(ITerraCellProducer* Producer)
{
    if (!Producer || Producers.Contains(Producer))
    {
        return;
    }
    Producers.Add(Producer);
    // Late producers receive every already-loaded cell so order of subsystem initialisation does not matter.
    for (const auto& Pair : Loaded)
    {
        Stats.ProducedActors += Producer->OnCellLoad(Pair.Value);
    }
    Stats.Producers = Producers.Num();
}

void UGeoStreamingSubsystem::UnregisterProducer(ITerraCellProducer* Producer)
{
    if (Producers.Remove(Producer) > 0)
    {
        for (const auto& Pair : Loaded)
        {
            Producer->OnCellUnload(Pair.Value);
        }
    }
    Stats.Producers = Producers.Num();
}

int64 UGeoStreamingSubsystem::SeedForKey(const FTerraCellKey& Key)
{
    // splitmix64 over the packed key: stable across platforms, matches the browser client's cellSeed intent.
    uint64 Z = (static_cast<uint64>(static_cast<uint32>(Key.X)) << 32) | static_cast<uint32>(Key.Y);
    Z += 0x9E3779B97F4A7C15ULL;
    Z = (Z ^ (Z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    Z = (Z ^ (Z >> 27)) * 0x94D049BB133111EBULL;
    Z = Z ^ (Z >> 31);
    return static_cast<int64>(Z & 0x7FFFFFFFFFFFFFFFULL);
}

FTerraCellKey UGeoStreamingSubsystem::KeyForGeographic(double Lat, double Lon) const
{
    // Equirectangular grid in metres from the equator/prime meridian; cells are square in metres at the player's
    // latitude band, which is what matters for gameplay density. Not a global tiling scheme.
    FTerraCellKey Key;
    Key.Y = FMath::FloorToInt(Lat * FTerraGeo::MetresPerDegreeLat() / CellSizeM);
    Key.X = FMath::FloorToInt(Lon * FTerraGeo::MetresPerDegreeLon(Lat) / CellSizeM);
    return Key;
}

FTerraCell UGeoStreamingSubsystem::MakeCell(const FTerraCellKey& Key) const
{
    FTerraCell Cell;
    Cell.Key = Key;
    Cell.SizeM = CellSizeM;
    Cell.Lat = (Key.Y + 0.5) * CellSizeM / FTerraGeo::MetresPerDegreeLat();
    Cell.Lon = (Key.X + 0.5) * CellSizeM / FTerraGeo::MetresPerDegreeLon(Cell.Lat);
    Cell.Seed = SeedForKey(Key);
    return Cell;
}

bool UGeoStreamingSubsystem::ReadPlayerGeographic(double& Lat, double& Lon) const
{
    APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
    double H;
    return Pawn && FTerraGeo::ToGeographic(GetWorld(), Pawn->GetActorLocation(), Lat, Lon, H);
}

void UGeoStreamingSubsystem::RefreshWanted(double Lat, double Lon)
{
    const FTerraCellKey Centre = KeyForGeographic(Lat, Lon);
    Pending.Reset();
    TSet<FTerraCellKey> Wanted;
    for (int32 dy = -RadiusCells; dy <= RadiusCells; ++dy)
    {
        for (int32 dx = -RadiusCells; dx <= RadiusCells; ++dx)
        {
            const int32 Ring = FMath::Max(FMath::Abs(dx), FMath::Abs(dy));
            if (dx * dx + dy * dy > RadiusCells * RadiusCells)
            {
                continue; // circular footprint
            }
            FTerraCellKey K; K.X = Centre.X + dx; K.Y = Centre.Y + dy;
            Wanted.Add(K);
            if (!Loaded.Contains(K))
            {
                Pending.Emplace(K, Ring);
            }
            else
            {
                Loaded[K].RingDistance = Ring;
            }
        }
    }
    Pending.Sort([](const TPair<FTerraCellKey, int32>& A, const TPair<FTerraCellKey, int32>& B) { return A.Value < B.Value; });

    // Unload with hysteresis: keep two extra rings so walking along a cell border does not thrash.
    const int32 KeepRadius = RadiusCells + 2;
    TArray<FTerraCellKey> ToUnload;
    for (const auto& Pair : Loaded)
    {
        const int32 dx = Pair.Key.X - Centre.X, dy = Pair.Key.Y - Centre.Y;
        if (dx * dx + dy * dy > KeepRadius * KeepRadius)
        {
            ToUnload.Add(Pair.Key);
        }
    }
    for (const FTerraCellKey& K : ToUnload)
    {
        UnloadCell(K);
    }
    LastPlayerKey = Centre;
    bHavePlayerKey = true;
}

void UGeoStreamingSubsystem::LoadCell(const FTerraCellKey& Key, int32 Ring)
{
    FTerraCell Cell = MakeCell(Key);
    Cell.RingDistance = Ring;
    Cell.LoadedAtSeconds = GetWorld()->GetTimeSeconds();
    int32 Produced = 0;
    for (ITerraCellProducer* P : Producers)
    {
        Produced += P->OnCellLoad(Cell);
    }
    Loaded.Add(Key, Cell);
    Stats.ProducedActors += Produced;
    ++LoadsThisSecond;
}

void UGeoStreamingSubsystem::UnloadCell(const FTerraCellKey& Key)
{
    FTerraCell Cell;
    if (!Loaded.RemoveAndCopyValue(Key, Cell))
    {
        return;
    }
    for (ITerraCellProducer* P : Producers)
    {
        P->OnCellUnload(Cell);
    }
    ++UnloadsThisSecond;
}

void UGeoStreamingSubsystem::Flush()
{
    TArray<FTerraCellKey> Keys;
    Loaded.GetKeys(Keys);
    for (const FTerraCellKey& K : Keys)
    {
        UnloadCell(K);
    }
    Stats.ProducedActors = 0;
    bHavePlayerKey = false;
}

void UGeoStreamingSubsystem::Tick(float DeltaTime)
{
    CvarRefreshAccumulator += DeltaTime;
    if (CvarRefreshAccumulator > 1.0f)
    {
        CvarRefreshAccumulator = 0.0f;
        const int32 OldRadius = RadiusCells;
        ReadCvars();
        if (OldRadius != RadiusCells)
        {
            bHavePlayerKey = false; // re-evaluate the footprint
        }
    }
    SecondAccumulator += DeltaTime;
    if (SecondAccumulator >= 1.0f)
    {
        SecondAccumulator = 0.0f;
        Stats.LoadsThisSecond = LoadsThisSecond;
        Stats.UnloadsThisSecond = UnloadsThisSecond;
        LoadsThisSecond = UnloadsThisSecond = 0;
    }

    double Lat, Lon;
    if (!ReadPlayerGeographic(Lat, Lon))
    {
        return;
    }
    Stats.PlayerLat = Lat;
    Stats.PlayerLon = Lon;
    const FTerraCellKey Centre = KeyForGeographic(Lat, Lon);
    if (!bHavePlayerKey || !(Centre == LastPlayerKey))
    {
        RefreshWanted(Lat, Lon);
    }

    const double Start = FPlatformTime::Seconds();
    int32 Loads = 0;
    while (Pending.Num() > 0 && Loads < MaxLoadsPerFrame && (FPlatformTime::Seconds() - Start) * 1000.0 < BudgetMs)
    {
        const TPair<FTerraCellKey, int32> Next = Pending[0];
        Pending.RemoveAt(0);
        LoadCell(Next.Key, Next.Value);
        ++Loads;
    }
    if (Loads > 0)
    {
        Stats.LastLoadMs = static_cast<float>((FPlatformTime::Seconds() - Start) * 1000.0);
    }
    Stats.LoadedCells = Loaded.Num();
    Stats.PendingCells = Pending.Num();
}
