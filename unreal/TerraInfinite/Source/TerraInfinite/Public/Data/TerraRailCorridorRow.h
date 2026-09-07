// Row struct for Content/Data/RailCorridors.json (type RailCorridor).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraGeoPoint.h"
#include "TerraRailCorridorRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraRailCorridorRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    /** suburban | metro | intercity | heritage - selects train model and speed limits. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Service;
    /** Ordered station row names along the corridor. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") TArray<FString> StationIds;
    /** Ordered approximate polyline followed by trains. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") TArray<FTerraGeoPoint> Path;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
};
