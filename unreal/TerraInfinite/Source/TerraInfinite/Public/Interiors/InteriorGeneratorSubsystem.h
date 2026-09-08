// Deterministic, coordinate-seeded interior generation.
//  - Plan(): builds an FTerraInteriorPlan (rooms, corridor, doors, stairs, lift) for a footprint + category using
//    the InteriorGrammar.json parameters and a seed derived from (lat, lon, category) - identical on every machine
//    and identical to a future port of the browser client's generator when it lands on the shared grammar.
//  - Spawn(): hero handcrafted layouts (Level Instances mapped by id) win; otherwise an ATerraInteriorShell actor
//    builds the plan from instanced cubes (floors, walls, stair steps) with an elevator volume and rooftop railing.
// SKELETON NOTE: room furnishing (props by room type) is a stub that only logs; walls/floors/stairs/lift are real.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Streaming/GeoStreamingSubsystem.h"
#include "Data/TerraInteriorGrammarRow.h"
#include "InteriorGeneratorSubsystem.generated.h"

class ATerraInteriorShell;
class ALevelInstance;
class UInstancedStaticMeshComponent;

USTRUCT(BlueprintType)
struct FTerraInteriorRoom
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Type;
    /** Local metres, floor-plan space (X right, Y forward), origin at the building's south-west corner. */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FVector2D Min = FVector2D::ZeroVector;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FVector2D Max = FVector2D::ZeroVector;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Floor = 0;
    /** Door position on the corridor wall (local metres). */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FVector2D Door = FVector2D::ZeroVector;
};

USTRUCT(BlueprintType)
struct FTerraInteriorPlan
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Category;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int64 Seed = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double WidthM = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double DepthM = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Floors = 1;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double FloorHeightM = 3.2;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double CorridorWidthM = 2.4;
    /** Corridor runs along Y at this X (local metres). */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double CorridorX = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") TArray<FTerraInteriorRoom> Rooms;
    /** Stair well footprint (local metres) - present for Floors > 1. */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FVector2D StairMin = FVector2D::ZeroVector;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FVector2D StairMax = FVector2D::ZeroVector;
    /** Lift shaft (local metres) - present for Floors > 2. */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") bool bHasLift = false;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FVector2D LiftMin = FVector2D::ZeroVector;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FVector2D LiftMax = FVector2D::ZeroVector;
    /** Entrance door on the south wall (local X metres). */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double EntranceX = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString DataNote;
};

USTRUCT(BlueprintType)
struct FTerraInteriorRequest
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadWrite, Category = "Terra") FString Id;
    UPROPERTY(BlueprintReadWrite, Category = "Terra") FString Category = TEXT("generic");
    UPROPERTY(BlueprintReadWrite, Category = "Terra") double Lat = 0.0;
    UPROPERTY(BlueprintReadWrite, Category = "Terra") double Lon = 0.0;
    UPROPERTY(BlueprintReadWrite, Category = "Terra") double GroundHeightM = 0.0;
    UPROPERTY(BlueprintReadWrite, Category = "Terra") double HeadingDeg = 0.0;
    UPROPERTY(BlueprintReadWrite, Category = "Terra") double WidthM = 20.0;
    UPROPERTY(BlueprintReadWrite, Category = "Terra") double DepthM = 12.0;
    UPROPERTY(BlueprintReadWrite, Category = "Terra") int32 Floors = 1;
    /** When set (hero layouts), a Level Instance of this world is spawned instead of a procedural shell. */
    UPROPERTY(BlueprintReadWrite, Category = "Terra") TSoftObjectPtr<UWorld> HandcraftedLevel;
};

USTRUCT(BlueprintType)
struct FTerraInteriorStats
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Spawned = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 HeroLevelInstances = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 PlansGenerated = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float LastPlanMs = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 WallInstances = 0;
};

UCLASS()
class TERRAINFINITE_API UInteriorGeneratorSubsystem : public UWorldSubsystem, public ITerraCellProducer
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Pure, deterministic. Same request -> same plan. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Interiors") FTerraInteriorPlan Plan(const FTerraInteriorRequest& Request);

    /** Spawns (or returns the existing) interior for the request id. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Interiors") AActor* Spawn(const FTerraInteriorRequest& Request);
    UFUNCTION(BlueprintCallable, Category = "Terra|Interiors") void Despawn(const FString& Id);
    UFUNCTION(BlueprintPure, Category = "Terra|Interiors") FTerraInteriorStats GetStats() const { return Stats; }

    /** Registry of hero handcrafted layouts by id (filled by the campus/landmark setup; empty in this scaffold). */
    UFUNCTION(BlueprintCallable, Category = "Terra|Interiors") void RegisterHeroLayout(const FString& Id, TSoftObjectPtr<UWorld> Level);

    static int64 SeedFor(double Lat, double Lon, const FString& Category);

    // ITerraCellProducer - campus buildings inside a loaded cell are spawned as interiors.
    virtual FName ProducerName() const override { return TEXT("Interiors"); }
    virtual int32 OnCellLoad(const FTerraCell& Cell) override;
    virtual void OnCellUnload(const FTerraCell& Cell) override;

private:
    FTerraInteriorGrammarRow GrammarFor(const FString& Category) const;
    void FurnishRoom(const FTerraInteriorRoom& Room, const FTerraInteriorPlan& Plan, ATerraInteriorShell* Shell);

    UPROPERTY() TMap<FString, TObjectPtr<AActor>> SpawnedById;
    UPROPERTY() TMap<FString, TSoftObjectPtr<UWorld>> HeroLayouts;
    TMap<FTerraCellKey, TArray<FString>> IdsByCell;
    FTerraInteriorStats Stats;
};

/** Procedural interior geometry built from instanced cubes; carries an elevator volume and a rooftop railing. */
UCLASS()
class TERRAINFINITE_API ATerraInteriorShell : public AActor
{
    GENERATED_BODY()

public:
    ATerraInteriorShell();
    void Build(const FTerraInteriorPlan& Plan);
    const FTerraInteriorPlan& GetPlan() const { return Plan; }
    int32 GetInstanceCount() const;

    UPROPERTY(VisibleAnywhere) TObjectPtr<UInstancedStaticMeshComponent> Walls;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UInstancedStaticMeshComponent> Floors;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UInstancedStaticMeshComponent> Steps;

private:
    /** Adds a box instance (local metres: centre + size). */
    void AddBox(UInstancedStaticMeshComponent* Comp, const FVector& CentreM, const FVector& SizeM);
    void AddWallWithDoor(double X0, double Y0, double X1, double Y1, double Z0, double Height, double DoorAt, double DoorWidth);

    UPROPERTY() FTerraInteriorPlan Plan;
};
