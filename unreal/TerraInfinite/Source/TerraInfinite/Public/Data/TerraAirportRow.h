// Row struct for Content/Data/Airports.json (type Airport).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraGeoPoint.h"
#include "TerraAirportRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraAirportRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Iata;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString City;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lat = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lon = 0.0;
    /** One runway direction in degrees; the opposite direction is +180. Approximate. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double RunwayHeadingDeg = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double RunwayLengthM = 2500.0;
    /** Terminal public-area anchor (passenger spawn / boarding gate). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FTerraGeoPoint Terminal;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
};
