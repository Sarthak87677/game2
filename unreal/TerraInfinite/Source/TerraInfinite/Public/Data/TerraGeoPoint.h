// Shared geographic point used by every Terra data table row. Mirrors `GeoPoint` in src/data/maharashtra/types.ts.
#pragma once

#include "CoreMinimal.h"
#include "TerraGeoPoint.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraGeoPoint
{
    GENERATED_BODY()

    /** WGS84 latitude in degrees (approximate public reference value unless the row's DataNote says otherwise). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra")
    double Lat = 0.0;

    /** WGS84 longitude in degrees. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra")
    double Lon = 0.0;

    FTerraGeoPoint() = default;
    FTerraGeoPoint(double InLat, double InLon) : Lat(InLat), Lon(InLon) {}

    /** Cesium-style longitude/latitude/height vector (X = lon, Y = lat, Z = height metres). */
    FVector ToLonLatHeight(double HeightM = 0.0) const { return FVector(Lon, Lat, HeightM); }

    /** Great-circle distance in metres (spherical approximation, fine for gameplay ranges). */
    double DistanceM(const FTerraGeoPoint& Other) const;
};
