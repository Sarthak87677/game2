// Row struct for Content/Data/Spawns.json (exported from src/data/maharashtra/spawns.ts, type SpawnPoint).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraSpawnRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraSpawnRow : public FTableRowBase
{
    GENERATED_BODY()

    /** Row name = spawn id (e.g. "gateway-of-india"). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Region;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lat = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lon = 0.0;
    /** Compass heading the player faces on spawn (degrees clockwise from north). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double HeadingDeg = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Description;
    /** What is measured vs generated here - always shown in the UI. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
    /** True for every spawn written from public reference values (all of them today). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") bool bApproximate = true;
};
