// Proximity interactions ("E - Board train to Pune", "E - Enter library") and lightweight activities (cricket nets,
// kite flying, tea stall, photo spot...). Interactions are registered by other systems (interiors, journeys,
// showrooms) and by the data tables (stations, ports, airports, destinations). Family-safe by construction: the only
// verbs are enter, board, inspect, play, photograph, talk.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Streaming/GeoStreamingSubsystem.h"
#include "ActivitySubsystem.generated.h"

DECLARE_DELEGATE(FTerraInteractionRun);

USTRUCT(BlueprintType)
struct FTerraInteraction
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Id;
    /** Verb phrase shown as "E - <Label>". */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Label;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double Lat = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double Lon = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float RadiusM = 6.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Priority = 0;
    /** Shown in the overlay when the interaction runs. */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Note;
    FTerraInteractionRun Run;
};

UENUM(BlueprintType)
enum class ETerraActivityState : uint8 { Available, Active, Done };

USTRUCT(BlueprintType)
struct FTerraActivity
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Id;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Title;
    /** cricket-nets | kite | tea-stall | photo-spot | walk-tour | bird-watching | boat-ride */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Kind;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double Lat = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double Lon = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float DurationSeconds = 30.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") ETerraActivityState State = ETerraActivityState::Available;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float Elapsed = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Note;
};

USTRUCT(BlueprintType)
struct FTerraActivityStats
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Interactions = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Activities = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Completed = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString ActiveActivity;
};

UCLASS()
class TERRAINFINITE_API UActivitySubsystem : public UTickableWorldSubsystem, public ITerraCellProducer
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;
    virtual void Tick(float DeltaTime) override;
    virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UActivitySubsystem, STATGROUP_Tickables); }
    virtual bool IsTickable() const override { return !IsTemplate() && GetWorld() && GetWorld()->IsGameWorld(); }

    void RegisterInteraction(const FTerraInteraction& Interaction);
    UFUNCTION(BlueprintCallable, Category = "Terra|Activities") void UnregisterInteraction(const FString& Id);
    /** Label of the best interaction in range of the pawn, or empty. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Activities") FString NearestInteractionLabel(APawn* Pawn);
    UFUNCTION(BlueprintCallable, Category = "Terra|Activities") bool RunNearestInteraction(APawn* Pawn);

    UFUNCTION(BlueprintCallable, Category = "Terra|Activities") bool StartActivity(const FString& Id);
    UFUNCTION(BlueprintCallable, Category = "Terra|Activities") void StopActivity();
    UFUNCTION(BlueprintPure, Category = "Terra|Activities") TArray<FTerraActivity> GetActivities() const { return Activities; }
    UFUNCTION(BlueprintPure, Category = "Terra|Activities") FTerraActivityStats GetStats() const;

    // ITerraCellProducer: seeds a few generic activities per loaded cell near the player (statistical beyond 300 m).
    virtual FName ProducerName() const override { return TEXT("Activities"); }
    virtual int32 OnCellLoad(const FTerraCell& Cell) override;
    virtual void OnCellUnload(const FTerraCell& Cell) override;

private:
    void RegisterDataTableInteractions();
    const FTerraInteraction* FindNearest(APawn* Pawn) const;

    TArray<FTerraInteraction> Interactions;
    TArray<FTerraActivity> Activities;
    TMap<FTerraCellKey, TArray<FString>> IdsByCell;
    int32 ActiveIndex = -1;
    int32 Completed = 0;
};
