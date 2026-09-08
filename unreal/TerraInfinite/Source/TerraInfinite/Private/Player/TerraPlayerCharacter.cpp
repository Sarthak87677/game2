#include "Player/TerraPlayerCharacter.h"
#include "TerraInfinite.h"
#include "Core/TerraGameSettings.h"
#include "Core/TerraInput.h"
#include "Geo/TerraGeo.h"
#include "Player/TerraMovementVolumes.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "EnhancedInputComponent.h"
#include "InputActionValue.h"
#include "CesiumGlobeAnchorComponent.h"
#include "CesiumOriginShiftComponent.h"
#include "Engine/World.h"
#include "TimerManager.h"

ATerraPlayerCharacter::ATerraPlayerCharacter()
{
    PrimaryActorTick.bCanEverTick = true;

    GetCapsuleComponent()->InitCapsuleSize(34.0f, 90.0f);

    UCharacterMovementComponent* Move = GetCharacterMovement();
    Move->MaxWalkSpeed = WalkSpeedCms;
    Move->JumpZVelocity = BaseJumpZ;
    Move->AirControl = 0.35f;
    Move->MaxStepHeight = 42.0f;          // stairs up to ~40 cm risers without special handling
    Move->SetWalkableFloorAngle(50.0f);   // steep ghat paths and ramps
    Move->bCanWalkOffLedges = true;       // rooftops are fenced by ATerraRooftopRailing instead
    Move->BrakingDecelerationWalking = 2048.0f;
    Move->bOrientRotationToMovement = true;
    Move->RotationRate = FRotator(0.0f, 540.0f, 0.0f);
    Move->bUseFlatBaseForFloorChecks = false;
    Move->PerchRadiusThreshold = 12.0f;
    Move->bImpartBaseVelocityX = Move->bImpartBaseVelocityY = Move->bImpartBaseVelocityZ = true;

    bUseControllerRotationYaw = false;

    SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArm->SetupAttachment(GetCapsuleComponent());
    SpringArm->TargetArmLength = 320.0f;
    SpringArm->bUsePawnControlRotation = true;
    SpringArm->bEnableCameraLag = true;
    SpringArm->CameraLagSpeed = 12.0f;
    SpringArm->SocketOffset = FVector(0.0f, 0.0f, 60.0f);

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SpringArm, USpringArmComponent::SocketName);
    Camera->bUsePawnControlRotation = false;

    // Cesium: keep the world origin near the player (origin shift) and expose a globe anchor for lat/lon placement.
    GlobeAnchor = CreateDefaultSubobject<UCesiumGlobeAnchorComponent>(TEXT("GlobeAnchor"));
    OriginShift = CreateDefaultSubobject<UCesiumOriginShiftComponent>(TEXT("OriginShift"));
}

void ATerraPlayerCharacter::BeginPlay()
{
    Super::BeginPlay();
    FallProtectionHeightM = UTerraGameSettings::Get()->FallProtectionHeightM;
    LastSafeTransform = GetActorTransform();
    ApplyCameraMode(ETerraCameraMode::ThirdPerson);
}

void ATerraPlayerCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    ATerraPlayerController* PC = Cast<ATerraPlayerController>(GetController());
    UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent);
    if (!PC || !PC->GetInputConfig() || !EIC)
    {
        return;
    }
    UTerraInputConfig* Cfg = PC->GetInputConfig();
    auto Bind = [this, EIC, Cfg](FName Name, ETriggerEvent Event, auto Fn)
    {
        if (UInputAction* Action = Cfg->FindAction(Name))
        {
            EIC->BindAction(Action, Event, this, Fn);
        }
    };
    Bind(UTerraInputConfig::Move, ETriggerEvent::Triggered, &ATerraPlayerCharacter::OnMove);
    Bind(UTerraInputConfig::Run, ETriggerEvent::Started, &ATerraPlayerCharacter::OnRunStarted);
    Bind(UTerraInputConfig::Run, ETriggerEvent::Completed, &ATerraPlayerCharacter::OnRunCompleted);
    Bind(UTerraInputConfig::Jump, ETriggerEvent::Started, &ATerraPlayerCharacter::OnJumpStarted);
    Bind(UTerraInputConfig::Jump, ETriggerEvent::Completed, &ATerraPlayerCharacter::OnJumpCompleted);
    Bind(UTerraInputConfig::Interact, ETriggerEvent::Started, &ATerraPlayerCharacter::OnInteractElevator);
}

void ATerraPlayerCharacter::OnMove(const FInputActionValue& Value)
{
    if (bFallProtectionActive || bIsParked)
    {
        return;
    }
    const FVector2D Axis = Value.Get<FVector2D>();
    // Move relative to the camera yaw, projected onto the local ground plane (planet up, not world +Z).
    const FVector Up = FTerraGeo::Up(GetWorld(), GetActorLocation());
    const FRotator CamRot = GetControlRotation();
    FVector Forward = FRotationMatrix(CamRot).GetUnitAxis(EAxis::X);
    Forward = FVector::VectorPlaneProject(Forward, Up).GetSafeNormal();
    const FVector Right = FVector::CrossProduct(Up, Forward).GetSafeNormal();
    AddMovementInput(Forward, Axis.Y);
    AddMovementInput(Right, Axis.X);
}

void ATerraPlayerCharacter::OnRunStarted(const FInputActionValue&)
{
    bRunHeld = true;
    GetCharacterMovement()->MaxWalkSpeed = RunSpeedCms;
}

void ATerraPlayerCharacter::OnRunCompleted(const FInputActionValue&)
{
    bRunHeld = false;
    GetCharacterMovement()->MaxWalkSpeed = WalkSpeedCms;
}

bool ATerraPlayerCharacter::CanJumpInternal_Implementation() const
{
    return !bFallProtectionActive && !bIsParked && Super::CanJumpInternal_Implementation();
}

void ATerraPlayerCharacter::OnJumpStarted(const FInputActionValue&)
{
    UCharacterMovementComponent* Move = GetCharacterMovement();
    if (ParkourZone)
    {
        // Jump assist: higher arc and a forward push in the direction of travel.
        Move->JumpZVelocity = BaseJumpZ * FMath::Sqrt(ParkourZone->JumpHeightMultiplier);
        const FVector Dir = GetVelocity().GetSafeNormal2D();
        if (!Dir.IsNearlyZero())
        {
            Move->Velocity += Dir * ParkourZone->ForwardAssistMps * 100.0f;
        }
    }
    else
    {
        Move->JumpZVelocity = BaseJumpZ;
    }
    Jump();
}

void ATerraPlayerCharacter::OnJumpCompleted(const FInputActionValue&)
{
    StopJumping();
}

void ATerraPlayerCharacter::OnInteractElevator(const FInputActionValue&)
{
    // Elevator call is the only interaction handled by the character itself; everything else goes through
    // UActivitySubsystem (see ATerraPlayerController::OnInteract). Both fire on the same key; the subsystem
    // ignores the press when the player is inside a cabin.
    if (CurrentElevator && !CurrentElevator->IsMoving())
    {
        CurrentElevator->CallNextFloor();
    }
}

void ATerraPlayerCharacter::SetParkourZone(ATerraParkourZone* Zone)
{
    ParkourZone = Zone;
}

void ATerraPlayerCharacter::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (bIsParked)
    {
        return;
    }
    UCharacterMovementComponent* Move = GetCharacterMovement();
    if (Move->IsMovingOnGround() && !CurrentElevator)
    {
        SafeSpotAccumulator += DeltaSeconds;
        if (SafeSpotAccumulator > 1.0f)
        {
            SafeSpotAccumulator = 0.0f;
            RememberSafeSpot();
        }
    }
    if (Move->IsFalling() && ParkourZone && Move->Velocity.Z < 0.0f)
    {
        TryMantle();
    }
}

void ATerraPlayerCharacter::RememberSafeSpot()
{
    LastSafeTransform = GetActorTransform();
}

void ATerraPlayerCharacter::OnMovementModeChanged(EMovementMode PrevMovementMode, uint8 PreviousCustomMode)
{
    Super::OnMovementModeChanged(PrevMovementMode, PreviousCustomMode);
    const UCharacterMovementComponent* Move = GetCharacterMovement();
    if (Move->MovementMode == MOVE_Falling)
    {
        const FVector Up = FTerraGeo::Up(GetWorld(), GetActorLocation());
        FallStartAltitudeCm = FVector::DotProduct(GetActorLocation(), Up);
        bTrackingFall = true;
    }
}

void ATerraPlayerCharacter::Landed(const FHitResult& Hit)
{
    Super::Landed(Hit);
    if (!bTrackingFall)
    {
        return;
    }
    bTrackingFall = false;
    const FVector Up = FTerraGeo::Up(GetWorld(), GetActorLocation());
    const float FallCm = FallStartAltitudeCm - FVector::DotProduct(GetActorLocation(), Up);
    const float FallM = FallCm / 100.0f;
    if (FallM >= FallProtectionHeightM)
    {
        TriggerFallProtection(FallM);
    }
}

void ATerraPlayerCharacter::TriggerFallProtection(float FallM)
{
    if (bFallProtectionActive)
    {
        return;
    }
    bFallProtectionActive = true;
    ++FallProtectionCount;
    UE_LOG(LogTerra, Log, TEXT("Fall of %.1f m - fade to respawn (no injury model)"), FallM);
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        if (PC->PlayerCameraManager)
        {
            PC->PlayerCameraManager->StartCameraFade(0.0f, 1.0f, FadeSeconds, FLinearColor::Black, false, true);
        }
    }
    GetWorld()->GetTimerManager().SetTimer(FallProtectionTimer, this, &ATerraPlayerCharacter::FinishFallProtection, FadeSeconds, false);
}

void ATerraPlayerCharacter::FinishFallProtection()
{
    GetCharacterMovement()->StopMovementImmediately();
    SetActorTransform(LastSafeTransform, false, nullptr, ETeleportType::TeleportPhysics);
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        if (PC->PlayerCameraManager)
        {
            PC->PlayerCameraManager->StartCameraFade(1.0f, 0.0f, FadeSeconds, FLinearColor::Black, false, false);
        }
    }
    bFallProtectionActive = false;
}

bool ATerraPlayerCharacter::TryMantle()
{
    // Ledge mantle: if there is a wall ahead at chest height and free space on top within MantleHeightM,
    // snap the capsule onto the ledge. Cheap: two traces per falling frame inside parkour zones only.
    const FVector Up = FTerraGeo::Up(GetWorld(), GetActorLocation());
    const FVector Forward = FVector::VectorPlaneProject(GetActorForwardVector(), Up).GetSafeNormal();
    const float Radius = GetCapsuleComponent()->GetScaledCapsuleRadius();
    const float HalfHeight = GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
    const FVector Chest = GetActorLocation() + Up * (HalfHeight * 0.2f);
    FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraMantle), false, this);

    FHitResult Wall;
    if (!GetWorld()->LineTraceSingleByChannel(Wall, Chest, Chest + Forward * (Radius + 60.0f), ECC_WorldStatic, Params))
    {
        return false;
    }
    const float MaxMantleCm = ParkourZone ? ParkourZone->MantleHeightM * 100.0f : 150.0f;
    const FVector Above = Wall.ImpactPoint + Forward * (Radius + 10.0f) + Up * MaxMantleCm;
    FHitResult Top;
    if (!GetWorld()->LineTraceSingleByChannel(Top, Above, Above - Up * (MaxMantleCm + 20.0f), ECC_WorldStatic, Params))
    {
        return false;
    }
    if (FVector::DotProduct(Top.ImpactNormal, Up) < 0.7f)
    {
        return false; // not a walkable ledge
    }
    const FVector Target = Top.ImpactPoint + Up * (HalfHeight + 2.0f);
    // Ensure the capsule fits on the ledge before snapping
    FCollisionShape Capsule = FCollisionShape::MakeCapsule(Radius * 0.9f, HalfHeight * 0.95f);
    if (GetWorld()->OverlapBlockingTestByChannel(Target, GetActorQuat(), ECC_Pawn, Capsule, Params))
    {
        return false;
    }
    SetActorLocation(Target, false, nullptr, ETeleportType::TeleportPhysics);
    GetCharacterMovement()->Velocity = Forward * 100.0f;
    GetCharacterMovement()->SetMovementMode(MOVE_Walking);
    return true;
}

bool ATerraPlayerCharacter::PlaceAtGeographic(double Lat, double Lon, double HeightM, double HeadingDeg)
{
    FVector Unreal;
    if (!FTerraGeo::ToUnreal(GetWorld(), Lat, Lon, HeightM, Unreal))
    {
        return false;
    }
    FRotator Rot;
    FTerraGeo::HeadingToRotation(GetWorld(), Unreal, HeadingDeg, Rot);
    GetCharacterMovement()->StopMovementImmediately();
    SetActorLocationAndRotation(Unreal, Rot, false, nullptr, ETeleportType::TeleportPhysics);
    if (AController* C = GetController())
    {
        C->SetControlRotation(Rot);
    }
    LastSafeTransform = GetActorTransform();
    bTrackingFall = false;
    return true;
}

bool ATerraPlayerCharacter::GetGeographic(double& Lat, double& Lon, double& HeightM) const
{
    return FTerraGeo::ToGeographic(GetWorld(), GetActorLocation(), Lat, Lon, HeightM);
}

void ATerraPlayerCharacter::ApplyCameraMode(ETerraCameraMode Mode)
{
    switch (Mode)
    {
    case ETerraCameraMode::FirstPerson:
        SpringArm->TargetArmLength = 0.0f;
        SpringArm->SocketOffset = FVector(10.0f, 0.0f, 70.0f);
        SpringArm->bEnableCameraLag = false;
        bUseControllerRotationYaw = true;
        GetCharacterMovement()->bOrientRotationToMovement = false;
        break;
    case ETerraCameraMode::ThirdPerson:
        SpringArm->TargetArmLength = 320.0f;
        SpringArm->SocketOffset = FVector(0.0f, 0.0f, 60.0f);
        SpringArm->bEnableCameraLag = true;
        bUseControllerRotationYaw = false;
        GetCharacterMovement()->bOrientRotationToMovement = true;
        break;
    case ETerraCameraMode::FarChase:
        SpringArm->TargetArmLength = 900.0f;
        SpringArm->SocketOffset = FVector(0.0f, 0.0f, 200.0f);
        SpringArm->bEnableCameraLag = true;
        bUseControllerRotationYaw = false;
        GetCharacterMovement()->bOrientRotationToMovement = true;
        break;
    }
}

void ATerraPlayerCharacter::SetParked(bool bParked)
{
    bIsParked = bParked;
    SetActorHiddenInGame(bParked);
    SetActorEnableCollision(!bParked);
    GetCharacterMovement()->SetMovementMode(bParked ? MOVE_None : MOVE_Walking);
    if (bParked)
    {
        GetCharacterMovement()->StopMovementImmediately();
    }
}
