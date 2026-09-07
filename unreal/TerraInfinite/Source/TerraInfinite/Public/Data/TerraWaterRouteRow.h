// Row struct for Content/Data/WaterRoutes.json (type WaterRoute).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraGeoPoint.h"
#include "TerraWaterRouteRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraWaterRouteRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString FromPortId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString ToPortId;
    /** ferry | speedboat | cruise */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Vessel;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") TArray<FTerraGeoPoint> Path;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
};
