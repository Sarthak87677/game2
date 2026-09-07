#include "Core/TerraGameMode.h"
#include "TerraInfinite.h"
#include "Core/TerraGameSettings.h"
#include "Core/TerraPlayerController.h"
#include "Data/TerraDataSubsystem.h"
#include "Geo/TerraGeo.h"
#include "Player/TerraPlayerCharacter.h"
#include "Vehicles/TerraVehiclePawn.h"
#include "Engine/World.h"
#include "HAL/IConsoleManager.h"
#include "Kismet/GameplayStatics.h"

static FAutoConsoleCommandWithWorldAndArgs GTerraSpawnCmd(
    TEXT("terra.Spawn"),
    TEXT("terra.Spawn <spawnId> - move the player to a Spawns.json row (e.g. gateway-of-india)."),
    FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
    {
        ATerraGameMode* GM = World ? Cast<ATerraGameMode>(World->GetAuthGameMode()) : nullptr;
        if (GM && Args.Num() >= 1)
        {
            GM->SpawnPlayerAt(Args[0]);
        }
    }));

static FAutoConsoleCommandWithWorldAndArgs GTerraGoToCmd(
    TEXT("terra.GoTo"),
    TEXT("terra.GoTo <lat> <lon> [headingDeg] - teleport the player (height sampled from terrain)."),
    FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
    {
        ATerraGameMode* GM = World ? Cast<ATerraGameMode>(World->GetAuthGameMode()) : nullptr;
        if (GM && Args.Num() >= 2)
        {
            const double Heading = Args.Num() >= 3 ? FCString::Atod(*Args[2]) : 0.0;
            GM->TeleportPlayer(FCString::Atod(*Args[0]), FCString::Atod(*Args[1]), Heading, true);
        }
    }));

static FAutoConsoleCommandWithWorld GTerraVehicleSpawnCmd(
    TEXT("terra.Vehicle.Spawn"),
    TEXT("Spawn the configured vehicle class in front of the player."),
    FConsoleCommandWithWorldDelegate::CreateLambda([](UWorld* World)
    {
        if (ATerraGameMode* GM = World ? Cast<ATerraGameMode>(World->GetAuthGameMode()) : nullptr)
        {
            GM->SpawnVehicleNearPlayer();
        }
    }));

ATerraGameMode::ATerraGameMode()
{
    DefaultPawnClass = ATerraPlayerCharacter::StaticClass();
    PlayerControllerClass = ATerraPlayerController::StaticClass();
    VehicleClass = ATerraVehiclePawn::StaticClass();
}

void ATerraGameMode::BeginPlay()
{
    Super::BeginPlay();
    if (!FTerraGeo::Georeference(GetWorld()))
    {
        UE_LOG(LogTerra, Error, TEXT("No CesiumGeoreference in this level - spawns and journeys cannot be placed. Add one (docs/UNREAL.md, Benchmark map)."));
    }
}

void ATerraGameMode::RestartPlayer(AController* NewPlayer)
{
    // The engine's default flow spawns at a PlayerStart; Terra spawns at a geographic row instead.
    Super::RestartPlayer(NewPlayer);
    const FString Id = SpawnId.IsEmpty() ? UTerraGameSettings::Get()->DefaultSpawnId : SpawnId;
    if (!SpawnPlayerAt(Id))
    {
        UE_LOG(LogTerra, Warning, TEXT("Spawn row '%s' unavailable; player left at the PlayerStart"), *Id);
    }
}

ATerraPlayerCharacter* ATerraGameMode::GetOrCreateCharacter(AController* Controller)
{
    if (!Controller)
    {
        return nullptr;
    }
    if (ATerraPlayerCharacter* Existing = Cast<ATerraPlayerCharacter>(Controller->GetPawn()))
    {
        return Existing;
    }
    if (ATerraPlayerController* TPC = Cast<ATerraPlayerController>(Controller))
    {
        if (ATerraPlayerCharacter* Parked = TPC->GetParkedCharacter())
        {
            return Parked;
        }
    }
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    ATerraPlayerCharacter* Character = GetWorld()->SpawnActor<ATerraPlayerCharacter>(ATerraPlayerCharacter::StaticClass(), FTransform::Identity, Params);
    if (Character)
    {
        Controller->Possess(Character);
    }
    return Character;
}

bool ATerraGameMode::PlaceCharacter(ATerraPlayerCharacter* Character, double Lat, double Lon, double HeadingDeg, bool bSampleGround)
{
    if (!Character)
    {
        return false;
    }
    double GroundM = 0.0;
    if (bSampleGround && !FTerraGeo::SampleGroundHeight(GetWorld(), Lat, Lon, GroundM))
    {
        // Tiles may not be loaded yet; the character's fall protection + ground settle handles the first seconds.
        GroundM = 50.0;
        UE_LOG(LogTerra, Verbose, TEXT("Ground not loaded at %.5f,%.5f; spawning 50 m up and settling"), Lat, Lon);
    }
    return Character->PlaceAtGeographic(Lat, Lon, GroundM + 1.0, HeadingDeg);
}

bool ATerraGameMode::SpawnPlayerAt(const FString& InSpawnId)
{
    UTerraDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UTerraDataSubsystem>() : nullptr;
    FTerraSpawnRow Row;
    if (!Data || !Data->FindSpawn(InSpawnId, Row))
    {
        return false;
    }
    APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
    ATerraPlayerCharacter* Character = GetOrCreateCharacter(PC);
    if (!PlaceCharacter(Character, Row.Lat, Row.Lon, Row.HeadingDeg, true))
    {
        return false;
    }
    CurrentSpawn = Row;
    if (ATerraPlayerController* TPC = Cast<ATerraPlayerController>(PC))
    {
        TPC->ShowNotice(FString::Printf(TEXT("%s - %s"), *Row.DisplayName, *Row.DataNote));
    }
    UE_LOG(LogTerra, Log, TEXT("Spawned at %s (%.5f, %.5f) - %s"), *Row.DisplayName, Row.Lat, Row.Lon, *Row.DataNote);
    return true;
}

bool ATerraGameMode::TeleportPlayer(double Lat, double Lon, double HeadingDeg, bool bSampleGround)
{
    APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
    return PlaceCharacter(GetOrCreateCharacter(PC), Lat, Lon, HeadingDeg, bSampleGround);
}

ATerraVehiclePawn* ATerraGameMode::SpawnVehicleNearPlayer()
{
    APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
    APawn* Pawn = PC ? PC->GetPawn() : nullptr;
    if (!Pawn || !VehicleClass)
    {
        return nullptr;
    }
    const FVector Forward = Pawn->GetActorForwardVector();
    const FVector Up = FTerraGeo::Up(GetWorld(), Pawn->GetActorLocation());
    const FTransform Xf(Pawn->GetActorRotation(), Pawn->GetActorLocation() + Forward * 500.0 + Up * 120.0);
    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
    ATerraVehiclePawn* Vehicle = GetWorld()->SpawnActor<ATerraVehiclePawn>(VehicleClass, Xf, Params);
    if (Vehicle)
    {
        UE_LOG(LogTerra, Log, TEXT("Spawned vehicle %s (%s)"), *Vehicle->GetName(), *Vehicle->GetProvenanceNote());
    }
    return Vehicle;
}
