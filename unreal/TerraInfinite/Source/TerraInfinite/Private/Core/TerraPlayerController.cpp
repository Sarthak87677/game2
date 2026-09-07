#include "Core/TerraPlayerController.h"
#include "TerraInfinite.h"
#include "Core/TerraInput.h"
#include "Player/TerraPlayerCharacter.h"
#include "Vehicles/TerraVehiclePawn.h"
#include "Activities/ActivitySubsystem.h"
#include "Perf/PerfDiagnosticsSubsystem.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputActionValue.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"

ATerraPlayerController::ATerraPlayerController()
{
    PrimaryActorTick.bCanEverTick = true;
    bShowMouseCursor = false;
}

void ATerraPlayerController::BeginPlay()
{
    Super::BeginPlay();
    const UTerraInputSettings* Settings = GetDefault<UTerraInputSettings>();
    MouseLookScale = Settings->MouseLookScale;
    GamepadLookDegreesPerSecond = Settings->GamepadLookDegreesPerSecond;

    if (ULocalPlayer* LP = GetLocalPlayer())
    {
        if (UEnhancedInputLocalPlayerSubsystem* Subsystem = LP->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>())
        {
            if (!InputConfig)
            {
                InputConfig = NewObject<UTerraInputConfig>(this);
                InputConfig->Build();
            }
            Subsystem->ClearAllMappings();
            Subsystem->AddMappingContext(InputConfig->GetMappingContext(), 0);
        }
    }
}

void ATerraPlayerController::SetupInputComponent()
{
    Super::SetupInputComponent();
    if (!InputConfig)
    {
        InputConfig = NewObject<UTerraInputConfig>(this);
        InputConfig->Build();
    }
    UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(InputComponent);
    if (!EIC)
    {
        UE_LOG(LogTerra, Error, TEXT("InputComponent is not an EnhancedInputComponent - check DefaultInput.ini"));
        return;
    }
    auto Bind = [this, EIC](FName Name, ETriggerEvent Event, auto Fn)
    {
        if (UInputAction* Action = InputConfig->FindAction(Name))
        {
            EIC->BindAction(Action, Event, this, Fn);
        }
    };
    Bind(UTerraInputConfig::Look, ETriggerEvent::Triggered, &ATerraPlayerController::OnLook);
    Bind(UTerraInputConfig::LookGamepad, ETriggerEvent::Triggered, &ATerraPlayerController::OnLookGamepad);
    Bind(UTerraInputConfig::CameraCycle, ETriggerEvent::Started, &ATerraPlayerController::OnCameraCycle);
    Bind(UTerraInputConfig::Interact, ETriggerEvent::Started, &ATerraPlayerController::OnInteract);
    Bind(UTerraInputConfig::EnterExitVehicle, ETriggerEvent::Started, &ATerraPlayerController::OnEnterExitVehicle);
    Bind(UTerraInputConfig::Diagnostics, ETriggerEvent::Started, &ATerraPlayerController::OnToggleDiagnostics);
    Bind(UTerraInputConfig::Pause, ETriggerEvent::Started, &ATerraPlayerController::OnPause);
}

void ATerraPlayerController::OnPossess(APawn* InPawn)
{
    Super::OnPossess(InPawn);
    // Pawns bind their own movement/vehicle actions in SetupPlayerInputComponent using this controller's config.
    SetCameraMode(CameraMode);
}

void ATerraPlayerController::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    PromptRefreshAccumulator += DeltaSeconds;
    if (PromptRefreshAccumulator >= 0.2f)
    {
        PromptRefreshAccumulator = 0.0f;
        RefreshInteractionPrompt();
    }
}

void ATerraPlayerController::OnLook(const FInputActionValue& Value)
{
    // Mouse deltas are per-frame counts; scale to degrees.
    const FVector2D Axis = Value.Get<FVector2D>();
    AddYawInput(Axis.X * MouseLookScale);
    AddPitchInput(Axis.Y * MouseLookScale);
}

void ATerraPlayerController::OnLookGamepad(const FInputActionValue& Value)
{
    // Sticks are normalised to [-1, 1]; treat as a per-second rate.
    const FVector2D Axis = Value.Get<FVector2D>();
    const float Scale = GamepadLookDegreesPerSecond * GetWorld()->GetDeltaSeconds();
    AddYawInput(Axis.X * Scale);
    AddPitchInput(-Axis.Y * Scale);
}

void ATerraPlayerController::OnCameraCycle(const FInputActionValue&)
{
    const uint8 Next = (static_cast<uint8>(CameraMode) + 1) % 3;
    SetCameraMode(static_cast<ETerraCameraMode>(Next));
}

void ATerraPlayerController::SetCameraMode(ETerraCameraMode Mode)
{
    CameraMode = Mode;
    if (ATerraPlayerCharacter* Character = Cast<ATerraPlayerCharacter>(GetPawn()))
    {
        Character->ApplyCameraMode(Mode);
    }
    else if (ATerraVehiclePawn* Vehicle = Cast<ATerraVehiclePawn>(GetPawn()))
    {
        Vehicle->ApplyCameraMode(Mode);
    }
}

void ATerraPlayerController::OnInteract(const FInputActionValue&)
{
    if (UActivitySubsystem* Activities = GetWorld()->GetSubsystem<UActivitySubsystem>())
    {
        Activities->RunNearestInteraction(GetPawn());
    }
}

void ATerraPlayerController::OnEnterExitVehicle(const FInputActionValue&)
{
    if (IsDriving())
    {
        ExitVehicle();
        return;
    }
    APawn* Pawn = GetPawn();
    if (!Pawn)
    {
        return;
    }
    ATerraVehiclePawn* Nearest = nullptr;
    double NearestDist = 400.0 * 400.0; // 4 m
    for (TActorIterator<ATerraVehiclePawn> It(GetWorld()); It; ++It)
    {
        const double D = FVector::DistSquared(It->GetActorLocation(), Pawn->GetActorLocation());
        if (D < NearestDist && !It->IsOccupied())
        {
            NearestDist = D;
            Nearest = *It;
        }
    }
    if (Nearest)
    {
        EnterVehicle(Nearest);
    }
}

bool ATerraPlayerController::EnterVehicle(ATerraVehiclePawn* Vehicle)
{
    ATerraPlayerCharacter* Character = Cast<ATerraPlayerCharacter>(GetPawn());
    if (!Vehicle || !Character || Vehicle->IsOccupied())
    {
        return false;
    }
    ParkedCharacter = Character;
    Character->SetParked(true);
    CurrentVehicle = Vehicle;
    Vehicle->SetOccupied(true);
    Possess(Vehicle);
    ShowNotice(FString::Printf(TEXT("Driving %s. %s"), *Vehicle->GetDisplayName(), *Vehicle->GetProvenanceNote()));
    return true;
}

bool ATerraPlayerController::ExitVehicle()
{
    if (!CurrentVehicle || !ParkedCharacter)
    {
        return false;
    }
    const FTransform Exit = CurrentVehicle->GetExitTransform();
    ATerraVehiclePawn* Vehicle = CurrentVehicle;
    CurrentVehicle = nullptr;
    Vehicle->SetOccupied(false);
    Vehicle->StopInputs();
    ParkedCharacter->SetActorTransform(Exit, false, nullptr, ETeleportType::TeleportPhysics);
    ParkedCharacter->SetParked(false);
    Possess(ParkedCharacter);
    ParkedCharacter = nullptr;
    return true;
}

void ATerraPlayerController::OnToggleDiagnostics(const FInputActionValue&)
{
    if (UPerfDiagnosticsSubsystem* Perf = GetWorld()->GetSubsystem<UPerfDiagnosticsSubsystem>())
    {
        Perf->ToggleOverlay();
    }
}

void ATerraPlayerController::OnPause(const FInputActionValue&)
{
    const bool bPaused = !UGameplayStatics::IsGamePaused(this);
    UGameplayStatics::SetGamePaused(this, bPaused);
    bShowMouseCursor = bPaused;
    ShowNotice(bPaused ? TEXT("Paused") : TEXT(""));
}

void ATerraPlayerController::ShowNotice(const FString& Text)
{
    OnNotice.Broadcast(Text);
    if (!Text.IsEmpty())
    {
        UE_LOG(LogTerra, Log, TEXT("[notice] %s"), *Text);
    }
}

void ATerraPlayerController::RefreshInteractionPrompt()
{
    InteractionPrompt.Reset();
    if (UActivitySubsystem* Activities = GetWorld()->GetSubsystem<UActivitySubsystem>())
    {
        InteractionPrompt = Activities->NearestInteractionLabel(GetPawn());
    }
}
