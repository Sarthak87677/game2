// Row structs for Content/Data/Campuses.json and Content/Data/CampusBuildings.json.
// The campus spec's TypeScript type is owned by the interiors track; the exporter normalises it with field-name
// heuristics and keeps anything it did not understand in ExtraJson, so nothing is silently dropped.
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraGeoPoint.h"
#include "TerraCampusRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraCampusRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lat = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lon = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double HeadingDeg = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") int32 BuildingCount = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Description;
    /** Always "original, fictionalised" - campuses are never surveyed reconstructions. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString ExtraJson;
};

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraCampusBuildingRow : public FTableRowBase
{
    GENERATED_BODY()

    /** "<campusId>:<buildingId>" */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString CampusId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString BuildingId;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    /** Interior grammar category (library, classroom-block, hostel, canteen, auditorium, admin, lab, sports...). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lat = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lon = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double HeadingDeg = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double WidthM = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double DepthM = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") int32 Floors = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double FloorHeightM = 3.2;
    /** Optional footprint polygon; empty means "use Width x Depth rectangle rotated by HeadingDeg". */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") TArray<FTerraGeoPoint> Footprint;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString ExtraJson;
};
