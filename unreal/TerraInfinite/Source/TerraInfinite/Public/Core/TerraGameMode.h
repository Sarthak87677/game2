// Game mode: spawns the player at a Spawns.json row (georeferenced through Cesium), wires the default classes and
// exposes teleport/spawn helpers used by the console commands and the benchmark runner.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Data/TerraSpawnRow.h"
#include "TerraGameMode.generated.h"

class ATerraPlayerCharacter;
class ATerraVehiclePawn;

UCLASS()
class TERRAINFINITE_API ATerraGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    ATerraGameMode();

    virtual void BeginPlay() override;
    virtual void RestartPlayer(AController* NewPlayer) override;

    /** Spawn id used for this map (empty -> UTerraGameSettings::DefaultSpawnId). Settable per level in the editor. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra")
    FString SpawnId;

    /** Vehicle class spawned by terra.Vehicle.Spawn and by showroom interactions. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra")
    TSubclassOf<ATerraVehiclePawn> VehicleClass;

    /** Moves (or spawns) the player's character to a spawn row; returns false if the row or georeference is missing. */
    UFUNCTION(BlueprintCallable, Category = "Terra")
    bool SpawnPlayerAt(const FString& InSpawnId);

    /** Teleport to arbitrary coordinates; height is sampled from the terrain when bSampleGround is true. */
    UFUNCTION(BlueprintCallable, Category = "Terra")
    bool TeleportPlayer(double Lat, double Lon, double HeadingDeg, bool bSampleGround = true);

    /** Spawns a vehicle a few metres in front of the player and returns it (nullptr without VehicleClass). */
    UFUNCTION(BlueprintCallable, Category = "Terra")
    ATerraVehiclePawn* SpawnVehicleNearPlayer();

    UFUNCTION(BlueprintPure, Category = "Terra")
    const FTerraSpawnRow& GetCurrentSpawn() const { return CurrentSpawn; }

private:
    ATerraPlayerCharacter* GetOrCreateCharacter(AController* Controller);
    bool PlaceCharacter(ATerraPlayerCharacter* Character, double Lat, double Lon, double HeadingDeg, bool bSampleGround);

    UPROPERTY() FTerraSpawnRow CurrentSpawn;
};
