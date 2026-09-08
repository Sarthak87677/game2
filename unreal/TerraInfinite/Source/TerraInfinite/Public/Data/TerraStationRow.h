// Row struct for Content/Data/Stations.json (type Station).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraStationRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraStationRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    /** Official station code where known (CSMT, PUNE...). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Code;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString District;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lat = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lon = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") int32 Platforms = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
};
