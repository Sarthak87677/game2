// The only place that talks to Cesium for Unreal's georeference API. Everything else in the module converts through
// these helpers so a Cesium API change (they renamed these between 1.x and 2.x) is a one-file fix.
// Written against Cesium for Unreal 2.x (ACesiumGeoreference::TransformLongitudeLatitudeHeightPositionToUnreal).
#pragma once

#include "CoreMinimal.h"
#include "Data/TerraGeoPoint.h"

class ACesiumGeoreference;
class UWorld;

struct TERRAINFINITE_API FTerraGeo
{
    /** Default georeference for the world (nullptr when the level has none - every caller must handle that). */
    static ACesiumGeoreference* Georeference(const UWorld* World);

    /** lon/lat/height (deg, deg, m above WGS84 ellipsoid) -> Unreal world position (cm). */
    static bool ToUnreal(const UWorld* World, double Lat, double Lon, double HeightM, FVector& OutUnreal);
    static bool ToUnreal(const UWorld* World, const FTerraGeoPoint& Point, double HeightM, FVector& OutUnreal);

    /** Unreal world position (cm) -> lat/lon/height. */
    static bool ToGeographic(const UWorld* World, const FVector& Unreal, double& OutLat, double& OutLon, double& OutHeightM);

    /** World rotation whose forward axis points along the given compass heading at the given Unreal location. */
    static bool HeadingToRotation(const UWorld* World, const FVector& Unreal, double HeadingDeg, FRotator& OutRotation);

    /** Local "up" (ellipsoid normal) at an Unreal location; falls back to +Z without a georeference. */
    static FVector Up(const UWorld* World, const FVector& Unreal);

    /** Height of the streamed terrain / tiles under a point, by line trace (m above ellipsoid). Expensive: cache it. */
    static bool SampleGroundHeight(UWorld* World, double Lat, double Lon, double& OutHeightM, double ProbeFromM = 5000.0);

    /** Metres per degree at a latitude (for cell grids and coarse distance maths). */
    static double MetresPerDegreeLat();
    static double MetresPerDegreeLon(double LatDeg);
};
