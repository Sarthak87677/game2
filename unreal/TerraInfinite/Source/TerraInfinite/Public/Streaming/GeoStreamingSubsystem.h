// Gameplay-content cell streaming around the player. Cesium streams terrain/tiles by itself and World Partition
// streams hand-placed actors; this subsystem streams everything Terra generates (procedural buildings, interiors,
// campus pieces, traffic/crowd spawners, activity markers) in a geographic grid of CellSizeM squares:
//   - cells within RadiusCells of the player are requested, nearest first, at most MaxLoadsPerFrame per frame and
//     within a millisecond budget; cells beyond RadiusCells + 2 are unloaded;
//   - producers register through RegisterProducer() and receive OnCellLoad / OnCellUnload with a deterministic seed.
// The subsystem itself creates no geometry; that is the producers' job (interiors, campus, traffic...).
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "GeoStreamingSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FTerraCellKey
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 X = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Y = 0;

    bool operator==(const FTerraCellKey& O) const { return X == O.X && Y == O.Y; }
    friend uint32 GetTypeHash(const FTerraCellKey& K) { return HashCombine(::GetTypeHash(K.X), ::GetTypeHash(K.Y)); }
};

USTRUCT(BlueprintType)
struct FTerraCell
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FTerraCellKey Key;
    /** Cell centre. */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double Lat = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double Lon = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double SizeM = 256.0;
    /** Deterministic seed derived from the key (same cell -> same content on every machine). */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int64 Seed = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double LoadedAtSeconds = 0.0;
    /** Distance in cells from the player when last evaluated (0 = player's cell). */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 RingDistance = 0;
};

/** Implemented by anything that fills cells with content. */
class TERRAINFINITE_API ITerraCellProducer
{
public:
    virtual ~ITerraCellProducer() = default;
    virtual FName ProducerName() const = 0;
    /** Return the number of actors/instances created (for diagnostics). Must stay within a few ms. */
    virtual int32 OnCellLoad(const FTerraCell& Cell) = 0;
    virtual void OnCellUnload(const FTerraCell& Cell) = 0;
};

USTRUCT(BlueprintType)
struct FTerraStreamingStats
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 LoadedCells = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 PendingCells = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 LoadsThisSecond = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 UnloadsThisSecond = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float LastLoadMs = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 ProducedActors = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Producers = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double PlayerLat = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double PlayerLon = 0.0;
};

UCLASS()
class TERRAINFINITE_API UGeoStreamingSubsystem : public UTickableWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;
    virtual void Tick(float DeltaTime) override;
    virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UGeoStreamingSubsystem, STATGROUP_Tickables); }
    virtual bool IsTickable() const override { return !IsTemplate() && GetWorld() && GetWorld()->IsGameWorld(); }

    void RegisterProducer(ITerraCellProducer* Producer);
    void UnregisterProducer(ITerraCellProducer* Producer);

    UFUNCTION(BlueprintPure, Category = "Terra|Streaming") FTerraStreamingStats GetStats() const { return Stats; }
    UFUNCTION(BlueprintPure, Category = "Terra|Streaming") int32 GetLoadedCellCount() const { return Loaded.Num(); }
    UFUNCTION(BlueprintPure, Category = "Terra|Streaming") bool IsCellLoaded(const FTerraCellKey& Key) const { return Loaded.Contains(Key); }

    /** Forces every cell out and re-streams around the player (used after teleports and quality changes). */
    UFUNCTION(BlueprintCallable, Category = "Terra|Streaming") void Flush();

    FTerraCellKey KeyForGeographic(double Lat, double Lon) const;
    FTerraCell MakeCell(const FTerraCellKey& Key) const;
    static int64 SeedForKey(const FTerraCellKey& Key);

private:
    bool ReadPlayerGeographic(double& Lat, double& Lon) const;
    void RefreshWanted(double Lat, double Lon);
    void LoadCell(const FTerraCellKey& Key, int32 Ring);
    void UnloadCell(const FTerraCellKey& Key);
    void ReadCvars();

    TArray<ITerraCellProducer*> Producers;
    TMap<FTerraCellKey, FTerraCell> Loaded;
    TArray<TPair<FTerraCellKey, int32>> Pending; // sorted nearest first
    FTerraCellKey LastPlayerKey;
    bool bHavePlayerKey = false;
    FTerraStreamingStats Stats;

    double CellSizeM = 256.0;
    int32 RadiusCells = 6;
    int32 MaxLoadsPerFrame = 2;
    double BudgetMs = 2.0;
    float CvarRefreshAccumulator = 0.0f;
    float SecondAccumulator = 0.0f;
    int32 LoadsThisSecond = 0;
    int32 UnloadsThisSecond = 0;
};
