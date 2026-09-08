// Reads private credentials from Config/Secrets.ini (git-ignored) or environment variables and applies them to
// Cesium for Unreal. Nothing here is ever written back to disk or logged in full.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "TerraSecretsSubsystem.generated.h"

class ACesium3DTileset;

UCLASS()
class TERRAINFINITE_API UTerraSecretsSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    UFUNCTION(BlueprintPure, Category = "Terra|Secrets") bool HasCesiumIonToken() const { return !CesiumIonToken.IsEmpty(); }
    UFUNCTION(BlueprintPure, Category = "Terra|Secrets") bool HasGoogleTilesKey() const { return !GoogleTilesKey.IsEmpty(); }
    UFUNCTION(BlueprintPure, Category = "Terra|Secrets") bool HasCustomTilesetUrl() const { return !TilesetUrl.IsEmpty(); }

    /** Masked for UI/diagnostics (first 4 characters + length), never the full value. */
    UFUNCTION(BlueprintPure, Category = "Terra|Secrets") FString DescribeCredentials() const;

    /**
     * Configures a Cesium3DTileset actor for the best available source:
     *  - Google Photorealistic 3D Tiles via URL when GoogleTilesKey is set (attribution overlay is mandatory),
     *  - a custom tileset URL when TilesetUrl is set,
     *  - otherwise Cesium World Terrain (ion asset 1) when an ion token exists,
     *  - otherwise leaves the actor untouched and returns false (level should carry an open-data terrain).
     */
    UFUNCTION(BlueprintCallable, Category = "Terra|Secrets") bool ConfigureTileset(ACesium3DTileset* Tileset) const;

    /** Name of the source ConfigureTileset would pick ("google-3d-tiles", "custom", "cesium-world-terrain", "open-fallback"). */
    UFUNCTION(BlueprintPure, Category = "Terra|Secrets") FString ActiveTerrainSource() const;

    const FString& GetCesiumIonToken() const { return CesiumIonToken; }

private:
    void LoadFromFileAndEnvironment();
    void ApplyToCesium() const;

    FString CesiumIonToken;
    FString GoogleTilesKey;
    FString TilesetUrl;
};
