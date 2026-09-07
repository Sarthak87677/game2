// Chaos wheeled vehicle with lights (off/low/high), indicators + hazards, horn, wipers, cosmetic damage FX and a
// stuck/flipped reset. No damage-to-people paths exist: collisions only scuff the paintwork (family-safe policy).
// SKELETON NOTE: the wheel/engine/transmission setup lives on the Chaos movement component and needs a skeletal
// mesh with wheel bones; until an original vehicle asset is authored, spawning this class yields a functional but
// wheel-less physics body (see docs/UNREAL.md, "What needs a real machine").
#pragma once

#include "CoreMinimal.h"
#include "WheeledVehiclePawn.h"
#include "Core/TerraPlayerController.h"
#include "TerraVehiclePawn.generated.h"

class UCameraComponent;
class USpringArmComponent;
class USpotLightComponent;
class UPointLightComponent;
class UAudioComponent;
class UNiagaraSystem;
class UNiagaraComponent;
class UCesiumGlobeAnchorComponent;
class UCesiumOriginShiftComponent;
class UChaosWheeledVehicleMovementComponent;
struct FInputActionValue;

UENUM(BlueprintType)
enum class ETerraHeadlightMode : uint8 { Off, Low, High };

UENUM(BlueprintType)
enum class ETerraIndicatorMode : uint8 { Off, Left, Right, Hazards };

UENUM(BlueprintType)
enum class ETerraWiperMode : uint8 { Off, Intermittent, On };

UCLASS()
class TERRAINFINITE_API ATerraVehiclePawn : public AWheeledVehiclePawn
{
    GENERATED_BODY()

public:
    ATerraVehiclePawn();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
    virtual void NotifyHit(UPrimitiveComponent* MyComp, AActor* Other, UPrimitiveComponent* OtherComp, bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse, const FHitResult& Hit) override;

    /** Fictional, original vehicle name shown in the HUD (never a real brand). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Vehicle") FString DisplayName = TEXT("Terra hatchback (original design)");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Vehicle") float TopSpeedKph = 140.0f;
    /** Seconds with throttle held and no movement before the reset prompt / auto-reset. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Vehicle") float StuckSeconds = 4.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|FX") TObjectPtr<UNiagaraSystem> ScuffFX;

    UFUNCTION(BlueprintPure, Category = "Terra|Vehicle") const FString& GetDisplayName() const { return DisplayName; }
    UFUNCTION(BlueprintPure, Category = "Terra|Vehicle") FString GetProvenanceNote() const;
    UFUNCTION(BlueprintPure, Category = "Terra|Vehicle") bool IsOccupied() const { return bOccupied; }
    void SetOccupied(bool bIn) { bOccupied = bIn; }
    UFUNCTION(BlueprintPure, Category = "Terra|Vehicle") float GetSpeedKph() const;
    UFUNCTION(BlueprintPure, Category = "Terra|Vehicle") ETerraHeadlightMode GetHeadlights() const { return Headlights; }
    UFUNCTION(BlueprintPure, Category = "Terra|Vehicle") ETerraIndicatorMode GetIndicators() const { return Indicators; }
    UFUNCTION(BlueprintPure, Category = "Terra|Vehicle") ETerraWiperMode GetWipers() const { return Wipers; }
    UFUNCTION(BlueprintPure, Category = "Terra|Vehicle") float GetCosmeticDamage() const { return CosmeticDamage; }

    UFUNCTION(BlueprintCallable, Category = "Terra|Vehicle") void CycleHeadlights();
    UFUNCTION(BlueprintCallable, Category = "Terra|Vehicle") void ToggleIndicator(ETerraIndicatorMode Side);
    UFUNCTION(BlueprintCallable, Category = "Terra|Vehicle") void CycleWipers();
    UFUNCTION(BlueprintCallable, Category = "Terra|Vehicle") void SetHorn(bool bOn);
    /** Puts the vehicle back on its wheels 1 m up, facing its last heading, with zero velocity. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Vehicle") void ResetVehicle();
    void StopInputs();
    void ApplyCameraMode(ETerraCameraMode Mode);
    /** Where the character re-appears when leaving (driver side, 2 m out). */
    FTransform GetExitTransform() const;

    UFUNCTION(BlueprintCallable, Category = "Terra|Vehicle") bool PlaceAtGeographic(double Lat, double Lon, double HeightM, double HeadingDeg);

private:
    void OnMove(const FInputActionValue& Value);
    void OnMoveCompleted(const FInputActionValue& Value);
    void OnHandbrakeStarted(const FInputActionValue& Value);
    void OnHandbrakeCompleted(const FInputActionValue& Value);
    void OnHornStarted(const FInputActionValue& Value);
    void OnHornCompleted(const FInputActionValue& Value);
    void OnLights(const FInputActionValue& Value);
    void OnIndicatorLeft(const FInputActionValue& Value);
    void OnIndicatorRight(const FInputActionValue& Value);
    void OnHazards(const FInputActionValue& Value);
    void OnWipers(const FInputActionValue& Value);
    void OnReset(const FInputActionValue& Value);

    void UpdateIndicatorBlink(float DeltaSeconds);
    void UpdateWipers(float DeltaSeconds);
    void UpdateStuckDetection(float DeltaSeconds);
    void ApplyHeadlights();
    UChaosWheeledVehicleMovementComponent* ChaosMovement() const;

    UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> SpringArm;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
    UPROPERTY(VisibleAnywhere) TObjectPtr<USpotLightComponent> HeadlightL;
    UPROPERTY(VisibleAnywhere) TObjectPtr<USpotLightComponent> HeadlightR;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> IndicatorFL;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> IndicatorFR;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> IndicatorRL;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> IndicatorRR;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> TailL;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> TailR;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UAudioComponent> HornAudio;
    UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> WiperPivot;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCesiumGlobeAnchorComponent> GlobeAnchor;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCesiumOriginShiftComponent> OriginShift;

    ETerraHeadlightMode Headlights = ETerraHeadlightMode::Off;
    ETerraIndicatorMode Indicators = ETerraIndicatorMode::Off;
    ETerraWiperMode Wipers = ETerraWiperMode::Off;
    bool bOccupied = false;
    bool bHornOn = false;
    bool bBrakeLights = false;
    float BlinkTimer = 0.0f;
    bool bBlinkOn = false;
    float WiperPhase = 0.0f;
    float WiperPause = 0.0f;
    float StuckTimer = 0.0f;
    float ThrottleHeld = 0.0f;
    float CosmeticDamage = 0.0f;
    float LastScuffTime = -10.0f;
    int32 ResetCount = 0;
};
