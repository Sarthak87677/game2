// Row struct for Content/Data/InteriorGrammar.json - per-category parameters of the procedural interior generator.
// The grammar's TypeScript type is owned by the interiors track; known scalars are mapped to named properties and
// every other numeric / string parameter lands in NumericParams / StringParams (nested values in ExtraJson).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraInteriorGrammarRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraInteriorGrammarRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double FloorHeightM = 3.2;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double CorridorWidthM = 2.4;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double RoomMinM = 3.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double RoomMaxM = 12.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") TArray<FString> RoomTypes;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") TMap<FString, double> NumericParams;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") TMap<FString, FString> StringParams;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString ExtraJson;

    double Num(const FString& Key, double Default) const
    {
        const double* Found = NumericParams.Find(Key);
        return Found ? *Found : Default;
    }
};
