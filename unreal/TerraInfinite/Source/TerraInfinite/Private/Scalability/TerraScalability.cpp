#include "Scalability/TerraScalability.h"
#include "TerraInfinite.h"
#include "Scalability.h"
#include "HAL/IConsoleManager.h"
#include "GameFramework/GameUserSettings.h"

FName UTerraScalabilityLibrary::ActivePreset = NAME_None;

static FAutoConsoleCommand GTerraQualityCmd(
    TEXT("terra.Quality"),
    TEXT("terra.Quality <Low|Medium|High|Ultra|Performance> - apply a Terra scalability preset."),
    FConsoleCommandWithArgsDelegate::CreateLambda([](const TArray<FString>& Args)
    {
        if (Args.Num() >= 1)
        {
            UTerraScalabilityLibrary::ApplyPreset(FName(*Args[0]));
        }
    }));

bool UTerraScalabilityLibrary::SetCvar(const FString& Name, const FString& Value)
{
    IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(*Name);
    if (!Var)
    {
        UE_LOG(LogTerra, Warning, TEXT("Unknown console variable %s"), *Name);
        return false;
    }
    Var->Set(*Value, ECVF_SetByGameSetting);
    return true;
}

FString UTerraScalabilityLibrary::GetCvar(const FString& Name)
{
    IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(*Name);
    return Var ? Var->GetString() : FString();
}

void UTerraScalabilityLibrary::ParseCvarList(const FString& List, TArray<TPair<FString, FString>>& Out)
{
    TArray<FString> Items;
    List.ParseIntoArray(Items, TEXT(";"), true);
    for (const FString& Item : Items)
    {
        FString Name, Value;
        if (Item.Split(TEXT("="), &Name, &Value))
        {
            Out.Emplace(Name.TrimStartAndEnd(), Value.TrimStartAndEnd());
        }
    }
}

TArray<FName> UTerraScalabilityLibrary::GetPresetNames()
{
    TArray<FName> Names;
    for (const FTerraQualityPreset& P : GetDefault<UTerraScalabilitySettings>()->Presets)
    {
        Names.Add(P.Name);
    }
    return Names;
}

FName UTerraScalabilityLibrary::GetActivePreset()
{
    return ActivePreset;
}

bool UTerraScalabilityLibrary::ApplyPreset(FName PresetName)
{
    const UTerraScalabilitySettings* Settings = GetDefault<UTerraScalabilitySettings>();
    const FTerraQualityPreset* Preset = Settings->Presets.FindByPredicate([&](const FTerraQualityPreset& P)
    {
        return P.Name.ToString().Equals(PresetName.ToString(), ESearchCase::IgnoreCase);
    });
    if (!Preset)
    {
        UE_LOG(LogTerra, Warning, TEXT("Unknown quality preset %s"), *PresetName.ToString());
        return false;
    }

    TArray<FString> LevelStrings;
    Preset->Levels.ParseIntoArray(LevelStrings, TEXT(","), true);
    if (LevelStrings.Num() < 11)
    {
        UE_LOG(LogTerra, Error, TEXT("Preset %s needs 11 levels, has %d"), *PresetName.ToString(), LevelStrings.Num());
        return false;
    }
    auto L = [&](int32 i) { return FMath::Clamp(FCString::Atoi(*LevelStrings[i]), 0, 4); };

    Scalability::FQualityLevels Levels = Scalability::GetQualityLevels();
    Levels.ViewDistanceQuality = L(0);
    Levels.AntiAliasingQuality = L(1);
    Levels.ShadowQuality = L(2);
    Levels.GlobalIlluminationQuality = L(3);
    Levels.ReflectionQuality = L(4);
    Levels.PostProcessQuality = L(5);
    Levels.TextureQuality = L(6);
    Levels.EffectsQuality = L(7);
    Levels.FoliageQuality = L(8);
    Levels.ShadingQuality = L(9);
    Levels.LandscapeQuality = L(10);
    Levels.ResolutionQuality = Preset->ResolutionPercent;
    Scalability::SetQualityLevels(Levels);

    SetCvar(TEXT("r.DynamicRes.MinScreenPercentage"), FString::SanitizeFloat(Preset->DynResMin));
    SetCvar(TEXT("r.DynamicRes.MaxScreenPercentage"), FString::SanitizeFloat(Preset->DynResMax));
    SetCvar(TEXT("r.DynamicRes.FrameTimeBudget"), FString::SanitizeFloat(Preset->FrameBudgetMs));
    SetCvar(TEXT("t.MaxFPS"), FString::SanitizeFloat(Preset->MaxFps));

    if (UGameUserSettings* UserSettings = GEngine ? GEngine->GetGameUserSettings() : nullptr)
    {
        UserSettings->SetFrameRateLimit(Preset->MaxFps);
        UserSettings->ApplyNonResolutionSettings();
    }
    ActivePreset = Preset->Name;
    UE_LOG(LogTerra, Log, TEXT("Applied quality preset %s (levels %s, res %.0f%%, budget %.1f ms)"), *Preset->Name.ToString(), *Preset->Levels, Preset->ResolutionPercent, Preset->FrameBudgetMs);
    return true;
}
