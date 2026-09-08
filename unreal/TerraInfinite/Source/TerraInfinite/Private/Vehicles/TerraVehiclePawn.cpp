#include "Vehicles/TerraVehiclePawn.h"
#include "TerraInfinite.h"
#include "Core/TerraGameSettings.h"
#include "Core/TerraInput.h"
#include "Geo/TerraGeo.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Camera/CameraComponent.h"
#include "Components/AudioComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/SpotLightComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "EnhancedInputComponent.h"
#include "InputActionValue.h"
#include "NiagaraFunctionLibrary.h"
#include "NiagaraSystem.h"
#include "CesiumGlobeAnchorComponent.h"
#include "CesiumOriginShiftComponent.h"
#include "Engine/World.h"

ATerraVehiclePawn::ATerraVehiclePawn()
{
    PrimaryActorTick.bCanEverTick = true;

    SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArm->SetupAttachment(GetMesh());
    SpringArm->TargetArmLength = 650.0f;
    SpringArm->SocketOffset = FVector(0.0f, 0.0f, 180.0f);
    SpringArm->bUsePawnControlRotation = true;
    SpringArm->bEnableCameraLag = true;
    SpringArm->CameraLagSpeed = 8.0f;
    SpringArm->bEnableCameraRotationLag = true;
    SpringArm->CameraRotationLagSpeed = 6.0f;

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SpringArm, USpringArmComponent::SocketName);

    auto MakeSpot = [this](const TCHAR* Name, const FVector& Rel) -> USpotLightComponent*
    {
        USpotLightComponent* L = CreateDefaultSubobject<USpotLightComponent>(Name);
        L->SetupAttachment(GetMesh());
        L->SetRelativeLocation(Rel);
        L->SetIntensity(0.0f);
        L->SetOuterConeAngle(35.0f);
        L->SetAttenuationRadius(6000.0f);
        L->SetLightColor(FLinearColor(1.0f, 0.95f, 0.85f));
        L->bAffectsWorld = true;
        return L;
    };
    HeadlightL = MakeSpot(TEXT("HeadlightL"), FVector(200.0f, -70.0f, 60.0f));
    HeadlightR = MakeSpot(TEXT("HeadlightR"), FVector(200.0f, 70.0f, 60.0f));

    auto MakePoint = [this](const TCHAR* Name, const FVector& Rel, const FLinearColor& Color) -> UPointLightComponent*
    {
        UPointLightComponent* L = CreateDefaultSubobject<UPointLightComponent>(Name);
        L->SetupAttachment(GetMesh());
        L->SetRelativeLocation(Rel);
        L->SetIntensity(0.0f);
        L->SetAttenuationRadius(300.0f);
        L->SetLightColor(Color);
        L->bAffectsWorld = true;
        return L;
    };
    const FLinearColor Amber(1.0f, 0.6f, 0.05f);
    const FLinearColor Red(1.0f, 0.05f, 0.02f);
    IndicatorFL = MakePoint(TEXT("IndicatorFL"), FVector(195.0f, -85.0f, 55.0f), Amber);
    IndicatorFR = MakePoint(TEXT("IndicatorFR"), FVector(195.0f, 85.0f, 55.0f), Amber);
    IndicatorRL = MakePoint(TEXT("IndicatorRL"), FVector(-200.0f, -85.0f, 70.0f), Amber);
    IndicatorRR = MakePoint(TEXT("IndicatorRR"), FVector(-200.0f, 85.0f, 70.0f), Amber);
    TailL = MakePoint(TEXT("TailL"), FVector(-205.0f, -70.0f, 70.0f), Red);
    TailR = MakePoint(TEXT("TailR"), FVector(-205.0f, 70.0f, 70.0f), Red);

    HornAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("HornAudio"));
    HornAudio->SetupAttachment(GetMesh());
    HornAudio->bAutoActivate = false;

    WiperPivot = CreateDefaultSubobject<USceneComponent>(TEXT("WiperPivot"));
    WiperPivot->SetupAttachment(GetMesh());
    WiperPivot->SetRelativeLocation(FVector(90.0f, 0.0f, 110.0f));

    GlobeAnchor = CreateDefaultSubobject<UCesiumGlobeAnchorComponent>(TEXT("GlobeAnchor"));
    OriginShift = CreateDefaultSubobject<UCesiumOriginShiftComponent>(TEXT("OriginShift"));
    // Only the possessed pawn should shift the origin; toggled in SetOccupied via Tick.
    OriginShift->SetMode(ECesiumOriginShiftMode::Disabled);
}

UChaosWheeledVehicleMovementComponent* ATerraVehiclePawn::ChaosMovement() const
{
    return Cast<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent());
}

void ATerraVehiclePawn::BeginPlay()
{
    Super::BeginPlay();
    ApplyHeadlights();
}

FString ATerraVehiclePawn::GetProvenanceNote() const
{
    return UTerraGameSettings::Get()->ProceduralContentNote + TEXT(" Original vehicle design, not a real make or model.");
}

void ATerraVehiclePawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
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
    Bind(UTerraInputConfig::Move, ETriggerEvent::Triggered, &ATerraVehiclePawn::OnMove);
    Bind(UTerraInputConfig::Move, ETriggerEvent::Completed, &ATerraVehiclePawn::OnMoveCompleted);
    Bind(UTerraInputConfig::Handbrake, ETriggerEvent::Started, &ATerraVehiclePawn::OnHandbrakeStarted);
    Bind(UTerraInputConfig::Handbrake, ETriggerEvent::Completed, &ATerraVehiclePawn::OnHandbrakeCompleted);
    Bind(UTerraInputConfig::Horn, ETriggerEvent::Started, &ATerraVehiclePawn::OnHornStarted);
    Bind(UTerraInputConfig::Horn, ETriggerEvent::Completed, &ATerraVehiclePawn::OnHornCompleted);
    Bind(UTerraInputConfig::Lights, ETriggerEvent::Started, &ATerraVehiclePawn::OnLights);
    Bind(UTerraInputConfig::IndicatorLeft, ETriggerEvent::Started, &ATerraVehiclePawn::OnIndicatorLeft);
    Bind(UTerraInputConfig::IndicatorRight, ETriggerEvent::Started, &ATerraVehiclePawn::OnIndicatorRight);
    Bind(UTerraInputConfig::Hazards, ETriggerEvent::Started, &ATerraVehiclePawn::OnHazards);
    Bind(UTerraInputConfig::Wipers, ETriggerEvent::Started, &ATerraVehiclePawn::OnWipers);
    Bind(UTerraInputConfig::ResetVehicle, ETriggerEvent::Started, &ATerraVehiclePawn::OnReset);
}

void ATerraVehiclePawn::OnMove(const FInputActionValue& Value)
{
    UChaosWheeledVehicleMovementComponent* MC = ChaosMovement();
    if (!MC)
    {
        return;
    }
    const FVector2D Axis = Value.Get<FVector2D>();
    MC->SetSteeringInput(Axis.X);
    const float Forward = MC->GetForwardSpeed();
    if (Axis.Y >= 0.0f)
    {
        MC->SetThrottleInput(Axis.Y);
        MC->SetBrakeInput(0.0f);
        bBrakeLights = false;
    }
    else if (Forward > 50.0f)
    {
        // Moving forward + pulling back = brake
        MC->SetThrottleInput(0.0f);
        MC->SetBrakeInput(-Axis.Y);
        bBrakeLights = true;
    }
    else
    {
        // Stopped or rolling back = reverse
        MC->SetThrottleInput(Axis.Y);
        MC->SetBrakeInput(0.0f);
        bBrakeLights = false;
    }
    ThrottleHeld = FMath::Abs(Axis.Y);
}

void ATerraVehiclePawn::OnMoveCompleted(const FInputActionValue&)
{
    StopInputs();
}

void ATerraVehiclePawn::StopInputs()
{
    if (UChaosWheeledVehicleMovementComponent* MC = ChaosMovement())
    {
        MC->SetThrottleInput(0.0f);
        MC->SetBrakeInput(0.0f);
        MC->SetSteeringInput(0.0f);
        MC->SetHandbrakeInput(false);
    }
    ThrottleHeld = 0.0f;
    bBrakeLights = false;
    SetHorn(false);
}

void ATerraVehiclePawn::OnHandbrakeStarted(const FInputActionValue&)
{
    if (UChaosWheeledVehicleMovementComponent* MC = ChaosMovement()) MC->SetHandbrakeInput(true);
    bBrakeLights = true;
}

void ATerraVehiclePawn::OnHandbrakeCompleted(const FInputActionValue&)
{
    if (UChaosWheeledVehicleMovementComponent* MC = ChaosMovement()) MC->SetHandbrakeInput(false);
    bBrakeLights = false;
}

void ATerraVehiclePawn::OnHornStarted(const FInputActionValue&) { SetHorn(true); }
void ATerraVehiclePawn::OnHornCompleted(const FInputActionValue&) { SetHorn(false); }
void ATerraVehiclePawn::OnLights(const FInputActionValue&) { CycleHeadlights(); }
void ATerraVehiclePawn::OnIndicatorLeft(const FInputActionValue&) { ToggleIndicator(ETerraIndicatorMode::Left); }
void ATerraVehiclePawn::OnIndicatorRight(const FInputActionValue&) { ToggleIndicator(ETerraIndicatorMode::Right); }
void ATerraVehiclePawn::OnHazards(const FInputActionValue&) { ToggleIndicator(ETerraIndicatorMode::Hazards); }
void ATerraVehiclePawn::OnWipers(const FInputActionValue&) { CycleWipers(); }
void ATerraVehiclePawn::OnReset(const FInputActionValue&) { ResetVehicle(); }

void ATerraVehiclePawn::SetHorn(bool bOn)
{
    if (bHornOn == bOn)
    {
        return;
    }
    bHornOn = bOn;
    if (HornAudio && HornAudio->Sound)
    {
        bOn ? HornAudio->Play() : HornAudio->Stop();
    }
}

void ATerraVehiclePawn::CycleHeadlights()
{
    Headlights = static_cast<ETerraHeadlightMode>((static_cast<uint8>(Headlights) + 1) % 3);
    ApplyHeadlights();
}

void ATerraVehiclePawn::ApplyHeadlights()
{
    float Intensity = 0.0f;
    float Cone = 35.0f;
    float Pitch = -4.0f;
    switch (Headlights)
    {
    case ETerraHeadlightMode::Off: break;
    case ETerraHeadlightMode::Low: Intensity = 8000.0f; Cone = 35.0f; Pitch = -6.0f; break;
    case ETerraHeadlightMode::High: Intensity = 20000.0f; Cone = 28.0f; Pitch = -1.0f; break;
    }
    for (USpotLightComponent* L : { HeadlightL.Get(), HeadlightR.Get() })
    {
        L->SetIntensity(Intensity);
        L->SetOuterConeAngle(Cone);
        L->SetRelativeRotation(FRotator(Pitch, 0.0f, 0.0f));
    }
}

void ATerraVehiclePawn::ToggleIndicator(ETerraIndicatorMode Side)
{
    Indicators = (Indicators == Side) ? ETerraIndicatorMode::Off : Side;
    BlinkTimer = 0.0f;
    bBlinkOn = true;
}

void ATerraVehiclePawn::CycleWipers()
{
    Wipers = static_cast<ETerraWiperMode>((static_cast<uint8>(Wipers) + 1) % 3);
    WiperPause = 0.0f;
}

void ATerraVehiclePawn::UpdateIndicatorBlink(float DeltaSeconds)
{
    if (Indicators == ETerraIndicatorMode::Off)
    {
        for (UPointLightComponent* L : { IndicatorFL.Get(), IndicatorFR.Get(), IndicatorRL.Get(), IndicatorRR.Get() }) L->SetIntensity(0.0f);
        return;
    }
    BlinkTimer += DeltaSeconds;
    if (BlinkTimer >= 0.4f) // ~75 blinks/min
    {
        BlinkTimer = 0.0f;
        bBlinkOn = !bBlinkOn;
    }
    const float On = bBlinkOn ? 2000.0f : 0.0f;
    const bool bLeft = Indicators == ETerraIndicatorMode::Left || Indicators == ETerraIndicatorMode::Hazards;
    const bool bRight = Indicators == ETerraIndicatorMode::Right || Indicators == ETerraIndicatorMode::Hazards;
    IndicatorFL->SetIntensity(bLeft ? On : 0.0f);
    IndicatorRL->SetIntensity(bLeft ? On : 0.0f);
    IndicatorFR->SetIntensity(bRight ? On : 0.0f);
    IndicatorRR->SetIntensity(bRight ? On : 0.0f);
}

void ATerraVehiclePawn::UpdateWipers(float DeltaSeconds)
{
    if (Wipers == ETerraWiperMode::Off)
    {
        WiperPivot->SetRelativeRotation(FRotator::ZeroRotator);
        return;
    }
    if (WiperPause > 0.0f)
    {
        WiperPause -= DeltaSeconds;
        return;
    }
    // One sweep = 1.2 s; intermittent inserts a 2.5 s pause between sweeps.
    WiperPhase += DeltaSeconds / 1.2f;
    if (WiperPhase >= 1.0f)
    {
        WiperPhase = 0.0f;
        if (Wipers == ETerraWiperMode::Intermittent)
        {
            WiperPause = 2.5f;
        }
    }
    const float Angle = FMath::Sin(WiperPhase * PI) * 70.0f;
    WiperPivot->SetRelativeRotation(FRotator(0.0f, 0.0f, Angle));
}

void ATerraVehiclePawn::UpdateStuckDetection(float DeltaSeconds)
{
    const FVector Up = FTerraGeo::Up(GetWorld(), GetActorLocation());
    const bool bFlipped = FVector::DotProduct(GetActorUpVector(), Up) < 0.2f;
    const bool bPushingButStill = ThrottleHeld > 0.5f && FMath::Abs(GetSpeedKph()) < 1.0f;
    if (bFlipped || bPushingButStill)
    {
        StuckTimer += DeltaSeconds;
        if (StuckTimer >= StuckSeconds)
        {
            UE_LOG(LogTerra, Log, TEXT("Vehicle stuck/flipped for %.1fs - auto reset"), StuckTimer);
            ResetVehicle();
        }
    }
    else
    {
        StuckTimer = 0.0f;
    }
}

void ATerraVehiclePawn::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    UpdateIndicatorBlink(DeltaSeconds);
    UpdateWipers(DeltaSeconds);
    if (bOccupied)
    {
        UpdateStuckDetection(DeltaSeconds);
    }
    const float Tail = (Headlights != ETerraHeadlightMode::Off ? 400.0f : 0.0f) + (bBrakeLights ? 1500.0f : 0.0f);
    TailL->SetIntensity(Tail);
    TailR->SetIntensity(Tail);
    if (OriginShift)
    {
        OriginShift->SetMode(bOccupied ? ECesiumOriginShiftMode::ChangeCesiumGeoreference : ECesiumOriginShiftMode::Disabled);
    }
    // Cosmetic damage slowly "washes off" so the car never looks wrecked - it is a family-safe world.
    CosmeticDamage = FMath::Max(0.0f, CosmeticDamage - DeltaSeconds * 0.01f);
}

float ATerraVehiclePawn::GetSpeedKph() const
{
    const UChaosWheeledVehicleMovementComponent* MC = ChaosMovement();
    return MC ? MC->GetForwardSpeed() * 0.036f : 0.0f; // cm/s -> km/h
}

void ATerraVehiclePawn::NotifyHit(UPrimitiveComponent* MyComp, AActor* Other, UPrimitiveComponent* OtherComp, bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse, const FHitResult& Hit)
{
    Super::NotifyHit(MyComp, Other, OtherComp, bSelfMoved, HitLocation, HitNormal, NormalImpulse, Hit);
    // Scuffs only: paint scratches + a dust puff. Pawns are never hurt (collision profile pushes them aside).
    const float Impulse = NormalImpulse.Size();
    const float Now = GetWorld()->GetTimeSeconds();
    if (Impulse > 20000.0f && Now - LastScuffTime > 0.5f)
    {
        LastScuffTime = Now;
        CosmeticDamage = FMath::Min(1.0f, CosmeticDamage + Impulse / 400000.0f);
        if (ScuffFX)
        {
            UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), ScuffFX, HitLocation, HitNormal.Rotation());
        }
    }
}

void ATerraVehiclePawn::ResetVehicle()
{
    ++ResetCount;
    StuckTimer = 0.0f;
    const FVector Up = FTerraGeo::Up(GetWorld(), GetActorLocation());
    const FVector Forward = FVector::VectorPlaneProject(GetActorForwardVector(), Up).GetSafeNormal();
    const FRotator Rot = FRotationMatrix::MakeFromXZ(Forward.IsNearlyZero() ? FVector::ForwardVector : Forward, Up).Rotator();
    if (USkeletalMeshComponent* Body = GetMesh())
    {
        Body->SetPhysicsLinearVelocity(FVector::ZeroVector);
        Body->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector);
    }
    SetActorLocationAndRotation(GetActorLocation() + Up * 100.0f, Rot, false, nullptr, ETeleportType::TeleportPhysics);
    StopInputs();
}

FTransform ATerraVehiclePawn::GetExitTransform() const
{
    const FVector Up = FTerraGeo::Up(GetWorld(), GetActorLocation());
    const FVector Left = -GetActorRightVector();
    return FTransform(GetActorRotation(), GetActorLocation() + Left * 200.0 + Up * 100.0);
}

void ATerraVehiclePawn::ApplyCameraMode(ETerraCameraMode Mode)
{
    switch (Mode)
    {
    case ETerraCameraMode::FirstPerson:
        SpringArm->TargetArmLength = 0.0f;
        SpringArm->SocketOffset = FVector(40.0f, -40.0f, 110.0f); // driver's seat (right-hand drive, India)
        break;
    case ETerraCameraMode::ThirdPerson:
        SpringArm->TargetArmLength = 650.0f;
        SpringArm->SocketOffset = FVector(0.0f, 0.0f, 180.0f);
        break;
    case ETerraCameraMode::FarChase:
        SpringArm->TargetArmLength = 1400.0f;
        SpringArm->SocketOffset = FVector(0.0f, 0.0f, 400.0f);
        break;
    }
}

bool ATerraVehiclePawn::PlaceAtGeographic(double Lat, double Lon, double HeightM, double HeadingDeg)
{
    FVector Unreal;
    if (!FTerraGeo::ToUnreal(GetWorld(), Lat, Lon, HeightM, Unreal))
    {
        return false;
    }
    FRotator Rot;
    FTerraGeo::HeadingToRotation(GetWorld(), Unreal, HeadingDeg, Rot);
    SetActorLocationAndRotation(Unreal, Rot, false, nullptr, ETeleportType::TeleportPhysics);
    return true;
}
