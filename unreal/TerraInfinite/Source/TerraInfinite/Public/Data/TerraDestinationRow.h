// Row struct for Content/Data/Destinations.json (type Destination in src/data/maharashtra/types.ts).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraDestinationRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraDestinationRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    /** city | town | hill-station | coast | fort | monument | temple | museum | stadium | station | airport | port | campus | showroom | park | dam | waterfall | nature | village */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Kind;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString District;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lat = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lon = 0.0;
    /** Preferred camera height above ground (m) when flying there from orbit. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double OverviewHeightM = 1000.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") bool bHasSpawn = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double SpawnLat = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double SpawnLon = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double SpawnHeadingDeg = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") TArray<FString> Tags;
    /** Outside Maharashtra (e.g. the Taj Mahal hero destination). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") bool bExternal = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Description;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
};
