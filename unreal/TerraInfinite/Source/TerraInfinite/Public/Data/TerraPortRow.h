// Row struct for Content/Data/Ports.json (type Port).
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "TerraPortRow.generated.h"

USTRUCT(BlueprintType)
struct TERRAINFINITE_API FTerraPortRow : public FTableRowBase
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DisplayName;
    /** jetty | harbour | marina | cruise-terminal */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString Kind;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lat = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") double Lon = 0.0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra") FString DataNote;
};
