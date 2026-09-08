// Player controller: owns the generated Enhanced Input context, switches possession between the character and a
// vehicle (parking the character while driving), cycles cameras, shows HUD notices and the diagnostics overlay.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "TerraPlayerController.generated.h"

class UTerraInputConfig;
class ATerraPlayerCharacter;
class ATerraVehiclePawn;
struct FInputActionValue;

UENUM(BlueprintType)
enum class ETerraCameraMode : uint8
{
    FirstPerson,
    ThirdPerson,
    FarChase,
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FTerraNoticeEvent, const FString&, Text);

UCLASS()
class TERRAINFINITE_API ATerraPlayerController : public APlayerController
{
    GENERATED_BODY()

public:
    ATerraPlayerController();

    virtual void BeginPlay() override;
    virtual void SetupInputComponent() override;
    virtual void OnPossess(APawn* InPawn) override;
    virtual void Tick(float DeltaSeconds) override;

    /** Enter a vehicle: the character is hidden and parked (not destroyed) so its state survives. */
    UFUNCTION(BlueprintCallable, Category = "Terra") bool EnterVehicle(ATerraVehiclePawn* Vehicle);
    /** Leave the current vehicle: the parked character re-appears beside the driver door. */
    UFUNCTION(BlueprintCallable, Category = "Terra") bool ExitVehicle();
    UFUNCTION(BlueprintPure, Category = "Terra") bool IsDriving() const { return CurrentVehicle != nullptr; }

    UFUNCTION(BlueprintPure, Category = "Terra") ETerraCameraMode GetCameraMode() const { return CameraMode; }
    UFUNCTION(BlueprintCallable, Category = "Terra") void SetCameraMode(ETerraCameraMode Mode);

    /** Short HUD text (provenance notes, prompts). Bound by the HUD widget. */
    UFUNCTION(BlueprintCallable, Category = "Terra") void ShowNotice(const FString& Text);
    UPROPERTY(BlueprintAssignable, Category = "Terra") FTerraNoticeEvent OnNotice;

    /** Current "E - ..." prompt (empty when nothing is in range). */
    UFUNCTION(BlueprintPure, Category = "Terra") const FString& GetInteractionPrompt() const { return InteractionPrompt; }

    ATerraPlayerCharacter* GetParkedCharacter() const { return ParkedCharacter; }
    UTerraInputConfig* GetInputConfig() const { return InputConfig; }

    float MouseLookScale = 0.12f;
    float GamepadLookDegreesPerSecond = 140.0f;

private:
    void OnLook(const FInputActionValue& Value);
    void OnLookGamepad(const FInputActionValue& Value);
    void OnCameraCycle(const FInputActionValue& Value);
    void OnInteract(const FInputActionValue& Value);
    void OnEnterExitVehicle(const FInputActionValue& Value);
    void OnToggleDiagnostics(const FInputActionValue& Value);
    void OnPause(const FInputActionValue& Value);
    void RefreshInteractionPrompt();

    UPROPERTY() TObjectPtr<UTerraInputConfig> InputConfig;
    UPROPERTY() TObjectPtr<ATerraPlayerCharacter> ParkedCharacter;
    UPROPERTY() TObjectPtr<ATerraVehiclePawn> CurrentVehicle;
    ETerraCameraMode CameraMode = ETerraCameraMode::ThirdPerson;
    FString InteractionPrompt;
    float PromptRefreshAccumulator = 0.0f;
};
