#include "Data/TerraDataSubsystem.h"
#include "TerraInfinite.h"
#include "HAL/IConsoleManager.h"
#include "JsonObjectConverter.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

double FTerraGeoPoint::DistanceM(const FTerraGeoPoint& Other) const
{
    constexpr double EarthRadiusM = 6371008.8;
    const double Lat1 = FMath::DegreesToRadians(Lat);
    const double Lat2 = FMath::DegreesToRadians(Other.Lat);
    const double DLat = Lat2 - Lat1;
    const double DLon = FMath::DegreesToRadians(Other.Lon - Lon);
    const double A = FMath::Sin(DLat * 0.5) * FMath::Sin(DLat * 0.5) + FMath::Cos(Lat1) * FMath::Cos(Lat2) * FMath::Sin(DLon * 0.5) * FMath::Sin(DLon * 0.5);
    return 2.0 * EarthRadiusM * FMath::Atan2(FMath::Sqrt(A), FMath::Sqrt(1.0 - A));
}

static FAutoConsoleCommandWithWorld GTerraDataReloadCmd(
    TEXT("terra.Data.Reload"),
    TEXT("Re-read Content/Data/*.json (produced by scripts/export-unreal-data.mjs)."),
    FConsoleCommandWithWorldDelegate::CreateLambda([](UWorld* World)
    {
        if (World && World->GetGameInstance())
        {
            if (UTerraDataSubsystem* Data = World->GetGameInstance()->GetSubsystem<UTerraDataSubsystem>())
            {
                Data->ReloadAll();
            }
        }
    }));

FString UTerraDataSubsystem::DataDirectory()
{
    return FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Data"));
}

void UTerraDataSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    ReloadAll();
}

template <typename RowType>
void UTerraDataSubsystem::LoadTable(const TCHAR* FileName, TArray<RowType>& Out)
{
    FTerraDataTableStatus Entry;
    Entry.File = FileName;
    Out.Reset();

    const FString Path = FPaths::Combine(DataDirectory(), FileName);
    FString Json;
    if (!FFileHelper::LoadFileToString(Json, *Path))
    {
        Entry.Error = FString::Printf(TEXT("missing: %s"), *Path);
        UE_LOG(LogTerra, Warning, TEXT("Data table %s not found (run: node scripts/export-unreal-data.mjs)"), *Path);
        Status.Add(Entry);
        return;
    }

    // JsonArrayStringToUStruct tolerates empty arrays ("[]"), which is what tables without a source yet contain.
    if (!FJsonObjectConverter::JsonArrayStringToUStruct<RowType>(Json, &Out, 0, 0))
    {
        Entry.Error = TEXT("parse error");
        UE_LOG(LogTerra, Error, TEXT("Data table %s failed to parse"), *Path);
        Status.Add(Entry);
        return;
    }

    Entry.Rows = Out.Num();
    Entry.bLoaded = true;
    Status.Add(Entry);
    UE_LOG(LogTerra, Log, TEXT("Loaded %d rows from %s"), Out.Num(), FileName);
}

void UTerraDataSubsystem::ReloadAll()
{
    Status.Reset();
    LoadTable(TEXT("Spawns.json"), Spawns);
    LoadTable(TEXT("Destinations.json"), Destinations);
    LoadTable(TEXT("Stations.json"), Stations);
    LoadTable(TEXT("RailCorridors.json"), RailCorridors);
    LoadTable(TEXT("Airports.json"), Airports);
    LoadTable(TEXT("Ports.json"), Ports);
    LoadTable(TEXT("WaterRoutes.json"), WaterRoutes);
    LoadTable(TEXT("Campuses.json"), Campuses);
    LoadTable(TEXT("CampusBuildings.json"), CampusBuildings);
    LoadTable(TEXT("InteriorGrammar.json"), InteriorGrammar);
}

template <typename RowType>
static bool FindByName(const TArray<RowType>& Rows, const FString& Id, RowType& Out)
{
    for (const RowType& Row : Rows)
    {
        if (Row.Name == Id)
        {
            Out = Row;
            return true;
        }
    }
    return false;
}

bool UTerraDataSubsystem::FindSpawn(const FString& Id, FTerraSpawnRow& Out) const { return FindByName(Spawns, Id, Out); }
bool UTerraDataSubsystem::FindStation(const FString& Id, FTerraStationRow& Out) const { return FindByName(Stations, Id, Out); }
bool UTerraDataSubsystem::FindAirport(const FString& Id, FTerraAirportRow& Out) const { return FindByName(Airports, Id, Out); }
bool UTerraDataSubsystem::FindPort(const FString& Id, FTerraPortRow& Out) const { return FindByName(Ports, Id, Out); }
bool UTerraDataSubsystem::FindGrammar(const FString& Category, FTerraInteriorGrammarRow& Out) const { return FindByName(InteriorGrammar, Category, Out); }

const FTerraRailCorridorRow* UTerraDataSubsystem::FindRailCorridor(const FString& Id) const
{
    return RailCorridors.FindByPredicate([&Id](const FTerraRailCorridorRow& R) { return R.Name == Id; });
}

const FTerraWaterRouteRow* UTerraDataSubsystem::FindWaterRoute(const FString& Id) const
{
    return WaterRoutes.FindByPredicate([&Id](const FTerraWaterRouteRow& R) { return R.Name == Id; });
}
