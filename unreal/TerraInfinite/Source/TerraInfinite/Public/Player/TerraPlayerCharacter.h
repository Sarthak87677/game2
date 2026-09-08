// The on-foot player: walk/run, stairs (step height + walkable angle), elevator riding, parkour zones with jump
// assist and ledge mantling, and fall protection (fade to black, respawn at the last safe spot - no injury model).
// Georeferenced through Cesium globe anchor + origin shift components so the character stays near the origin.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/TerraPlayerController.h"
#include "TerraPlayerCharacter.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UCesiumGlobeAnchorComponent;
class UCesiumOriginShiftComponent;
class ATerraElevatorVolume;
class ATerraParkourZone;
struct FInputActionValue;

UCLASS()
class TERRAINFINITE_API ATerraPlayerCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    ATerraPlayerCharacter();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
    virtual void Landed(const FHitResult& Hit) override;
    virtual void OnMovementModeChanged(EMovementMode PrevMovementMode, uint8 PreviousCustomMode) override;
    virtual bool CanJumpInternal_Implementation() const override;

    /** Places the character at lat/lon/height (m) facing a compass heading. False without a georeference. */
    UFUNCTION(BlueprintCallable, Category = "Terra") bool PlaceAtGeographic(double Lat, double Lon, double HeightM, double HeadingDeg);
    UFUNCTION(BlueprintPure, Category = "Terra") bool GetGeographic(double& Lat, double& Lon, double& HeightM) const;

    UFUNCTION(BlueprintCallable, Category = "Terra") void ApplyCameraMode(ETerraCameraMode Mode);

    /** Hidden + collision off while driving; nothing else changes. */
    void SetParked(bool bParked);
    bool IsParked() const { return bIsParked; }

    void SetCurrentElevator(ATerraElevatorVolume* Elevator) { CurrentElevator = Elevator; }
    void SetParkourZone(ATerraParkourZone* Zone);
    ATerraParkourZone* GetParkourZone() const { return ParkourZone; }

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Movement") float WalkSpeedCms = 250.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Movement") float RunSpeedCms = 550.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Movement") float BaseJumpZ = 420.0f;
    /** Height (m) of a fall that triggers fade-to-respawn (from UTerraGameSettings by default). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Safety") float FallProtectionHeightM = 12.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Safety") float FadeSeconds = 0.6f;

    UFUNCTION(BlueprintPure, Category = "Terra") bool IsRunning() const { return bRunHeld; }
    UFUNCTION(BlueprintPure, Category = "Terra") int32 GetFallProtectionCount() const { return FallProtectionCount; }

private:
    void OnMove(const FInputActionValue& Value);
    void OnRunStarted(const FInputActionValue& Value);
    void OnRunCompleted(const FInputActionValue& Value);
    void OnJumpStarted(const FInputActionValue& Value);
    void OnJumpCompleted(const FInputActionValue& Value);
    void OnInteractElevator(const FInputActionValue& Value);

    void RememberSafeSpot();
    void TriggerFallProtection(float FallM);
    void FinishFallProtection();
    bool TryMantle();

    UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> SpringArm;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCesiumGlobeAnchorComponent> GlobeAnchor;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCesiumOriginShiftComponent> OriginShift;

    UPROPERTY() TObjectPtr<ATerraElevatorVolume> CurrentElevator;
    UPROPERTY() TObjectPtr<ATerraParkourZone> ParkourZone;

    bool bRunHeld = false;
    bool bIsParked = false;
    bool bFallProtectionActive = false;
    float FallStartAltitudeCm = 0.0f;
    bool bTrackingFall = false;
    FTransform LastSafeTransform;
    float SafeSpotAccumulator = 0.0f;
    int32 FallProtectionCount = 0;
    FTimerHandle FallProtectionTimer;
};
