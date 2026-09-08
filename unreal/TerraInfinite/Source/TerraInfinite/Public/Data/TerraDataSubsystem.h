// Loads the JSON data tables written by scripts/export-unreal-data.mjs (Content/Data/*.json) into typed rows at
// start-up. No editor import step is needed: the JSON files are staged as loose files (DefaultGame.ini) and parsed
// with FJsonObjectConverter. Row lookups are by the row's Name (= the TypeScript id).
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "TerraSpawnRow.h"
#include "TerraDestinationRow.h"
#include "TerraStationRow.h"
#include "TerraRailCorridorRow.h"
#include "TerraAirportRow.h"
#include "TerraPortRow.h"
#include "TerraWaterRouteRow.h"
#include "TerraCampusRow.h"
#include "TerraInteriorGrammarRow.h"
#include "TerraDataSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FTerraDataTableStatus
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString File;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") int32 Rows = 0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") bool bLoaded = false;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Error;
};

UCLASS()
class TERRAINFINITE_API UTerraDataSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Re-reads every table from disk (also bound to the console command terra.Data.Reload). */
    UFUNCTION(BlueprintCallable, Category = "Terra|Data")
    void ReloadAll();

    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraSpawnRow>& GetSpawns() const { return Spawns; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraDestinationRow>& GetDestinations() const { return Destinations; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraStationRow>& GetStations() const { return Stations; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraRailCorridorRow>& GetRailCorridors() const { return RailCorridors; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraAirportRow>& GetAirports() const { return Airports; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraPortRow>& GetPorts() const { return Ports; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraWaterRouteRow>& GetWaterRoutes() const { return WaterRoutes; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraCampusRow>& GetCampuses() const { return Campuses; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraCampusBuildingRow>& GetCampusBuildings() const { return CampusBuildings; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraInteriorGrammarRow>& GetInteriorGrammar() const { return InteriorGrammar; }
    UFUNCTION(BlueprintPure, Category = "Terra|Data") const TArray<FTerraDataTableStatus>& GetStatus() const { return Status; }

    UFUNCTION(BlueprintCallable, Category = "Terra|Data") bool FindSpawn(const FString& Id, FTerraSpawnRow& Out) const;
    UFUNCTION(BlueprintCallable, Category = "Terra|Data") bool FindStation(const FString& Id, FTerraStationRow& Out) const;
    UFUNCTION(BlueprintCallable, Category = "Terra|Data") bool FindAirport(const FString& Id, FTerraAirportRow& Out) const;
    UFUNCTION(BlueprintCallable, Category = "Terra|Data") bool FindPort(const FString& Id, FTerraPortRow& Out) const;
    UFUNCTION(BlueprintCallable, Category = "Terra|Data") bool FindGrammar(const FString& Category, FTerraInteriorGrammarRow& Out) const;

    const FTerraRailCorridorRow* FindRailCorridor(const FString& Id) const;
    const FTerraWaterRouteRow* FindWaterRoute(const FString& Id) const;

    /** Directory the tables are read from: <ProjectContentDir>/Data. */
    static FString DataDirectory();

private:
    template <typename RowType>
    void LoadTable(const TCHAR* FileName, TArray<RowType>& Out);

    TArray<FTerraSpawnRow> Spawns;
    TArray<FTerraDestinationRow> Destinations;
    TArray<FTerraStationRow> Stations;
    TArray<FTerraRailCorridorRow> RailCorridors;
    TArray<FTerraAirportRow> Airports;
    TArray<FTerraPortRow> Ports;
    TArray<FTerraWaterRouteRow> WaterRoutes;
    TArray<FTerraCampusRow> Campuses;
    TArray<FTerraCampusBuildingRow> CampusBuildings;
    TArray<FTerraInteriorGrammarRow> InteriorGrammar;
    TArray<FTerraDataTableStatus> Status;
};
