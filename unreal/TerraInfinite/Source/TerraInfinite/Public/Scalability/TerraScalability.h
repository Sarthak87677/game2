// Quality presets (Low/Medium/High/Ultra/Performance) and the degradation ladder, both declared in
// DefaultScalability.ini under [/Script/TerraInfinite.TerraScalabilitySettings].
#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "TerraScalability.generated.h"

USTRUCT()
struct FTerraQualityPreset
{
    GENERATED_BODY()
    UPROPERTY(Config) FName Name;
    /** 11 comma-separated levels in Scalability group order (ViewDistance, AA, Shadow, GI, Reflection, PostProcess, Texture, Effects, Foliage, Shading, Landscape). */
    UPROPERTY(Config) FString Levels;
    UPROPERTY(Config) float ResolutionPercent = 100.0f;
    UPROPERTY(Config) float DynResMin = 50.0f;
    UPROPERTY(Config) float DynResMax = 100.0f;
    UPROPERTY(Config) float FrameBudgetMs = 16.6f;
    /** 0 = uncapped */
    UPROPERTY(Config) float MaxFps = 60.0f;
};

USTRUCT()
struct FTerraDegradationRung
{
    GENERATED_BODY()
    UPROPERTY(Config) FName Name;
    /** "cvar=value;cvar=value" applied when the rung is engaged. */
    UPROPERTY(Config) FString Cvars;
};

UCLASS(Config = Scalability, DefaultConfig, meta = (DisplayName = "Terra Infinite Scalability"))
class TERRAINFINITE_API UTerraScalabilitySettings : public UDeveloperSettings
{
    GENERATED_BODY()

public:
    UPROPERTY(Config, EditAnywhere, Category = "Presets") TArray<FTerraQualityPreset> Presets;
    UPROPERTY(Config, EditAnywhere, Category = "Governor") TArray<FTerraDegradationRung> DegradationLadder;
    UPROPERTY(Config, EditAnywhere, Category = "Governor") bool GovernorEnabled = true;
    UPROPERTY(Config, EditAnywhere, Category = "Governor") float GovernorSecondsBelowTargetBeforeStep = 3.0f;
    UPROPERTY(Config, EditAnywhere, Category = "Governor") float GovernorSecondsAboveTargetBeforeRestore = 10.0f;
    UPROPERTY(Config, EditAnywhere, Category = "Governor") float GovernorTargetFps = 60.0f;
    UPROPERTY(Config, EditAnywhere, Category = "Governor") float GovernorHysteresisFps = 6.0f;
};

UCLASS()
class TERRAINFINITE_API UTerraScalabilityLibrary : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:
    /** Applies a named preset from DefaultScalability.ini (case-insensitive). Returns false if unknown. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Scalability") static bool ApplyPreset(FName PresetName);
    UFUNCTION(BlueprintPure, Category = "Terra|Scalability") static TArray<FName> GetPresetNames();
    UFUNCTION(BlueprintPure, Category = "Terra|Scalability") static FName GetActivePreset();

    /** Sets a console variable from "name=value" text. Used by presets and the governor. */
    static bool SetCvar(const FString& Name, const FString& Value);
    static FString GetCvar(const FString& Name);
    static void ParseCvarList(const FString& List, TArray<TPair<FString, FString>>& Out);

private:
    static FName ActivePreset;
};
