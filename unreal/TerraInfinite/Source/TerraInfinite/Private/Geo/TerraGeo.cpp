#include "Geo/TerraGeo.h"
#include "TerraInfinite.h"
#include "CesiumGeoreference.h"
#include "Engine/World.h"
#include "CollisionQueryParams.h"

ACesiumGeoreference* FTerraGeo::Georeference(const UWorld* World)
{
    if (!World)
    {
        return nullptr;
    }
    return ACesiumGeoreference::GetDefaultGeoreference(World);
}

bool FTerraGeo::ToUnreal(const UWorld* World, double Lat, double Lon, double HeightM, FVector& OutUnreal)
{
    ACesiumGeoreference* Geo = Georeference(World);
    if (!Geo)
    {
        return false;
    }
    OutUnreal = Geo->TransformLongitudeLatitudeHeightPositionToUnreal(FVector(Lon, Lat, HeightM));
    return true;
}

bool FTerraGeo::ToUnreal(const UWorld* World, const FTerraGeoPoint& Point, double HeightM, FVector& OutUnreal)
{
    return ToUnreal(World, Point.Lat, Point.Lon, HeightM, OutUnreal);
}

bool FTerraGeo::ToGeographic(const UWorld* World, const FVector& Unreal, double& OutLat, double& OutLon, double& OutHeightM)
{
    ACesiumGeoreference* Geo = Georeference(World);
    if (!Geo)
    {
        return false;
    }
    const FVector LLH = Geo->TransformUnrealPositionToLongitudeLatitudeHeight(Unreal);
    OutLon = LLH.X;
    OutLat = LLH.Y;
    OutHeightM = LLH.Z;
    return true;
}

bool FTerraGeo::HeadingToRotation(const UWorld* World, const FVector& Unreal, double HeadingDeg, FRotator& OutRotation)
{
    ACesiumGeoreference* Geo = Georeference(World);
    if (!Geo)
    {
        OutRotation = FRotator(0.0, HeadingDeg - 90.0, 0.0);
        return false;
    }
    // Cesium's local frame is East-South-Up (left-handed). A compass heading of 0 = north = -South axis.
    const FMatrix EsuToUnreal = Geo->ComputeEastSouthUpToUnrealTransformation(Unreal);
    const FVector East = EsuToUnreal.GetScaledAxis(EAxis::X).GetSafeNormal();
    const FVector South = EsuToUnreal.GetScaledAxis(EAxis::Y).GetSafeNormal();
    const FVector UpAxis = EsuToUnreal.GetScaledAxis(EAxis::Z).GetSafeNormal();
    const double H = FMath::DegreesToRadians(HeadingDeg);
    const FVector Forward = (East * FMath::Sin(H) - South * FMath::Cos(H)).GetSafeNormal();
    OutRotation = FRotationMatrix::MakeFromXZ(Forward, UpAxis).Rotator();
    return true;
}

FVector FTerraGeo::Up(const UWorld* World, const FVector& Unreal)
{
    ACesiumGeoreference* Geo = Georeference(World);
    if (!Geo)
    {
        return FVector::UpVector;
    }
    return Geo->ComputeEastSouthUpToUnrealTransformation(Unreal).GetScaledAxis(EAxis::Z).GetSafeNormal();
}

bool FTerraGeo::SampleGroundHeight(UWorld* World, double Lat, double Lon, double& OutHeightM, double ProbeFromM)
{
    FVector Top, Bottom;
    if (!World || !ToUnreal(World, Lat, Lon, ProbeFromM, Top) || !ToUnreal(World, Lat, Lon, -500.0, Bottom))
    {
        return false;
    }
    FHitResult Hit;
    FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraGroundProbe), true);
    if (!World->LineTraceSingleByChannel(Hit, Top, Bottom, ECC_WorldStatic, Params))
    {
        return false;
    }
    double HitLat, HitLon;
    return ToGeographic(World, Hit.ImpactPoint, HitLat, HitLon, OutHeightM);
}

double FTerraGeo::MetresPerDegreeLat()
{
    return 111132.954;
}

double FTerraGeo::MetresPerDegreeLon(double LatDeg)
{
    return 111132.954 * FMath::Cos(FMath::DegreesToRadians(LatDeg));
}
