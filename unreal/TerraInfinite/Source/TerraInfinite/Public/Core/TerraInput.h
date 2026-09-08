// Enhanced Input without binary assets: actions and bindings are declared in DefaultInput.ini
// ([/Script/TerraInfinite.TerraInputSettings]) and turned into UInputAction / UInputMappingContext objects at run
// time by UTerraInputConfig. A hand-authored mapping context asset can replace the generated one via
// MappingContextOverride.
#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "TerraInput.generated.h"

UENUM()
enum class ETerraInputAxis : uint8
{
    None,
    X,
    Y,
};

USTRUCT()
struct FTerraInputActionSpec
{
    GENERATED_BODY()
    UPROPERTY(Config) FName Name;
    UPROPERTY(Config) EInputActionValueType ValueType = EInputActionValueType::Boolean;
    UPROPERTY(Config) FString Description;
};

USTRUCT()
struct FTerraInputBindingSpec
{
    GENERATED_BODY()
    UPROPERTY(Config) FName Action;
    UPROPERTY(Config) FKey Key;
    /** For 1-D keys feeding a 2-D action: which axis receives the value. */
    UPROPERTY(Config) ETerraInputAxis Axis = ETerraInputAxis::None;
    UPROPERTY(Config) bool bNegate = false;
    /** Negate only the Y component (mouse look). */
    UPROPERTY(Config) bool bNegateY = false;
};

UCLASS(Config = Input, DefaultConfig, meta = (DisplayName = "Terra Infinite Input"))
class TERRAINFINITE_API UTerraInputSettings : public UDeveloperSettings
{
    GENERATED_BODY()

public:
    UPROPERTY(Config, EditAnywhere, Category = "Actions") TArray<FTerraInputActionSpec> Actions;
    UPROPERTY(Config, EditAnywhere, Category = "Bindings") TArray<FTerraInputBindingSpec> Bindings;
    UPROPERTY(Config, EditAnywhere, Category = "Look") float MouseLookScale = 0.12f;
    UPROPERTY(Config, EditAnywhere, Category = "Look") float GamepadLookDegreesPerSecond = 140.0f;
    UPROPERTY(Config, EditAnywhere, Category = "Override") TSoftObjectPtr<UInputMappingContext> MappingContextOverride;
};

/** Run-time owner of the generated actions and mapping context (one per player controller). */
UCLASS()
class TERRAINFINITE_API UTerraInputConfig : public UObject
{
    GENERATED_BODY()

public:
    /** Builds actions + context from UTerraInputSettings. Safe to call once per controller. */
    void Build();

    UInputAction* FindAction(FName Name) const;
    UInputMappingContext* GetMappingContext() const { return MappingContext; }

    // Well-known action names (must match DefaultInput.ini)
    static const FName Move, Look, LookGamepad, Jump, Run, Interact, EnterExitVehicle, CameraCycle, Horn, Lights, IndicatorLeft, IndicatorRight, Hazards, Wipers, Handbrake, ResetVehicle, Diagnostics, Pause;

private:
    UPROPERTY() TMap<FName, TObjectPtr<UInputAction>> ActionsByName;
    UPROPERTY() TObjectPtr<UInputMappingContext> MappingContext;
};
