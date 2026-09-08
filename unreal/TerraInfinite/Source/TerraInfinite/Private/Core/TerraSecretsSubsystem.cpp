#include "Core/TerraSecretsSubsystem.h"
#include "TerraInfinite.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/Paths.h"
#include "HAL/PlatformMisc.h"
#include "Cesium3DTileset.h"
#include "CesiumRuntimeSettings.h"

void UTerraSecretsSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    LoadFromFileAndEnvironment();
    ApplyToCesium();
    UE_LOG(LogTerra, Log, TEXT("Credentials: %s -> terrain source %s"), *DescribeCredentials(), *ActiveTerrainSource());
}

static FString ReadSecret(const FConfigFile* File, const TCHAR* Key, const TCHAR* EnvName)
{
    FString Value = FPlatformMisc::GetEnvironmentVariable(EnvName);
    if (Value.IsEmpty() && File)
    {
        File->GetString(TEXT("Terra.Secrets"), Key, Value);
    }
    return Value.TrimStartAndEnd();
}

void UTerraSecretsSubsystem::LoadFromFileAndEnvironment()
{
    const FString Path = FPaths::Combine(FPaths::ProjectConfigDir(), TEXT("Secrets.ini"));
    FConfigFile File;
    const bool bHaveFile = FPaths::FileExists(Path);
    if (bHaveFile)
    {
        File.Read(Path);
    }
    else
    {
        UE_LOG(LogTerra, Log, TEXT("No Config/Secrets.ini (copy Secrets.ini.example to add keys); using open data only"));
    }
    CesiumIonToken = ReadSecret(bHaveFile ? &File : nullptr, TEXT("CesiumIonToken"), TEXT("TERRA_CESIUM_ION_TOKEN"));
    GoogleTilesKey = ReadSecret(bHaveFile ? &File : nullptr, TEXT("GoogleTilesKey"), TEXT("TERRA_GOOGLE_TILES_KEY"));
    TilesetUrl = ReadSecret(bHaveFile ? &File : nullptr, TEXT("TilesetUrl"), TEXT("TERRA_TILESET_URL"));
}

void UTerraSecretsSubsystem::ApplyToCesium() const
{
    if (CesiumIonToken.IsEmpty())
    {
        return;
    }
    // Cesium for Unreal reads its default token from the mutable runtime settings object; setting it here keeps the
    // token out of DefaultEngine.ini. Not saved back to config.
    if (UCesiumRuntimeSettings* Settings = GetMutableDefault<UCesiumRuntimeSettings>())
    {
        Settings->DefaultIonAccessToken = CesiumIonToken;
    }
}

static FString Mask(const FString& Value)
{
    if (Value.IsEmpty())
    {
        return TEXT("(none)");
    }
    return FString::Printf(TEXT("%s... (%d chars)"), *Value.Left(4), Value.Len());
}

FString UTerraSecretsSubsystem::DescribeCredentials() const
{
    return FString::Printf(TEXT("ion=%s google=%s tileset=%s"), *Mask(CesiumIonToken), *Mask(GoogleTilesKey), TilesetUrl.IsEmpty() ? TEXT("(none)") : TEXT("(set)"));
}

FString UTerraSecretsSubsystem::ActiveTerrainSource() const
{
    if (!GoogleTilesKey.IsEmpty()) return TEXT("google-3d-tiles");
    if (!TilesetUrl.IsEmpty()) return TEXT("custom");
    if (!CesiumIonToken.IsEmpty()) return TEXT("cesium-world-terrain");
    return TEXT("open-fallback");
}

bool UTerraSecretsSubsystem::ConfigureTileset(ACesium3DTileset* Tileset) const
{
    if (!Tileset)
    {
        return false;
    }
    if (!GoogleTilesKey.IsEmpty())
    {
        // Google's terms: attribution must stay visible (Cesium's credit system shows it), no offline caching.
        Tileset->SetTilesetSource(ETilesetSource::FromUrl);
        Tileset->SetUrl(FString::Printf(TEXT("https://tile.googleapis.com/v1/3dtiles/root.json?key=%s"), *GoogleTilesKey));
        Tileset->SetShowCreditsOnScreen(true);
        return true;
    }
    if (!TilesetUrl.IsEmpty())
    {
        Tileset->SetTilesetSource(ETilesetSource::FromUrl);
        Tileset->SetUrl(TilesetUrl);
        return true;
    }
    if (!CesiumIonToken.IsEmpty())
    {
        Tileset->SetTilesetSource(ETilesetSource::FromCesiumIon);
        Tileset->SetIonAssetID(1); // Cesium World Terrain
        Tileset->SetIonAccessToken(CesiumIonToken);
        return true;
    }
    return false;
}
