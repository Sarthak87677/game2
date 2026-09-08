// Project-wide gameplay settings (DefaultGame.ini, section [/Script/TerraInfinite.TerraGameSettings]).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "TerraGameSettings.generated.h"

UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Terra Infinite"))
class TERRAINFINITE_API UTerraGameSettings : public UDeveloperSettings
{
    GENERATED_BODY()

public:
    static const UTerraGameSettings* Get() { return GetDefault<UTerraGameSettings>(); }

    /** Appended to every generated overlay / ticket / interior name so nothing procedural is presented as real. */
    UPROPERTY(Config, EditAnywhere, Category = "Provenance")
    FString ProceduralContentNote = TEXT("Procedural / fictional - not surveyed. No real money, no real timetable.");

    UPROPERTY(Config, EditAnywhere, Category = "Provenance")
    FString ApproximateCoordinatesNote = TEXT("Approximate public reference position (within a few hundred metres).");

    /** Every rooftop the player can reach gets an invisible railing; there is no way to fall off one. */
    UPROPERTY(Config, EditAnywhere, Category = "Safety")
    bool RooftopRailingsEverywhere = true;

    /** Falls longer than this (metres) fade to black and respawn at the last safe spot - no injury, no damage. */
    UPROPERTY(Config, EditAnywhere, Category = "Safety", meta = (ClampMin = "3.0"))
    float FallProtectionHeightM = 12.0f;

    /** Spawn row (Content/Data/Spawns.json) used when the map does not specify one. */
    UPROPERTY(Config, EditAnywhere, Category = "Spawning")
    FString DefaultSpawnId = TEXT("gateway-of-india");

    /** Comma-separated spawn ids visited by terra.Benchmark.Run. */
    UPROPERTY(Config, EditAnywhere, Category = "Benchmark")
    FString BenchmarkSpawnIds = TEXT("gateway-of-india,marine-drive,sgis-campus,mahabaleshwar");

    UPROPERTY(Config, EditAnywhere, Category = "Benchmark", meta = (ClampMin = "5"))
    int32 BenchmarkDurationSeconds = 60;
};
