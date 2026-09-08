#include "Player/TerraMovementVolumes.h"
#include "TerraInfinite.h"
#include "Player/TerraPlayerCharacter.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

// ------------------------------------------------------------------------------------------------ elevator

ATerraElevatorVolume::ATerraElevatorVolume()
{
    PrimaryActorTick.bCanEverTick = true;

    Floor = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Floor"));
    SetRootComponent(Floor);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    if (Cube.Succeeded())
    {
        Floor->SetStaticMesh(Cube.Object);
    }
    Floor->SetRelativeScale3D(FVector(2.0f, 2.0f, 0.1f)); // 2 m x 2 m x 10 cm cabin floor
    Floor->SetCollisionProfileName(TEXT("TerraInteriorWall"));

    Cabin = CreateDefaultSubobject<UBoxComponent>(TEXT("Cabin"));
    Cabin->SetupAttachment(Floor);
    Cabin->SetBoxExtent(FVector(95.0f, 95.0f, 110.0f));
    Cabin->SetRelativeLocation(FVector(0.0f, 0.0f, 115.0f));
    Cabin->SetRelativeScale3D(FVector(0.5f, 0.5f, 10.0f)); // undo the floor's scale
    Cabin->SetCollisionProfileName(TEXT("TerraTriggerVolume"));
    Cabin->SetGenerateOverlapEvents(true);
}

void ATerraElevatorVolume::BeginPlay()
{
    Super::BeginPlay();
    BaseLocation = GetActorLocation();
    Cabin->OnComponentBeginOverlap.AddDynamic(this, &ATerraElevatorVolume::OnCabinBeginOverlap);
    Cabin->OnComponentEndOverlap.AddDynamic(this, &ATerraElevatorVolume::OnCabinEndOverlap);
}

void ATerraElevatorVolume::OnCabinBeginOverlap(UPrimitiveComponent*, AActor* Other, UPrimitiveComponent*, int32, bool, const FHitResult&)
{
    if (ATerraPlayerCharacter* C = Cast<ATerraPlayerCharacter>(Other))
    {
        Riders.AddUnique(C);
        C->SetCurrentElevator(this);
    }
}

void ATerraElevatorVolume::OnCabinEndOverlap(UPrimitiveComponent*, AActor* Other, UPrimitiveComponent*, int32)
{
    if (ATerraPlayerCharacter* C = Cast<ATerraPlayerCharacter>(Other))
    {
        Riders.Remove(C);
        C->SetCurrentElevator(nullptr);
    }
}

void ATerraElevatorVolume::CallToFloor(int32 Floor)
{
    if (!FloorHeightsM.IsValidIndex(Floor) || bMoving)
    {
        return;
    }
    TargetFloor = Floor;
    bMoving = TargetFloor != CurrentFloor;
}

void ATerraElevatorVolume::CallNextFloor()
{
    if (FloorHeightsM.Num() > 0)
    {
        CallToFloor((CurrentFloor + 1) % FloorHeightsM.Num());
    }
}

void ATerraElevatorVolume::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (DwellRemaining > 0.0f)
    {
        DwellRemaining -= DeltaSeconds;
        return;
    }
    if (!bMoving)
    {
        return;
    }
    const float TargetZ = FloorHeightsM[TargetFloor] * 100.0f;
    const FVector Up = GetActorUpVector();
    const FVector Current = GetActorLocation();
    const float CurrentZ = FVector::DotProduct(Current - BaseLocation, Up);
    const float Step = FMath::Clamp(TargetZ - CurrentZ, -SpeedMps * 100.0f * DeltaSeconds, SpeedMps * 100.0f * DeltaSeconds);
    const FVector Delta = Up * Step;
    SetActorLocation(Current + Delta, false, nullptr, ETeleportType::None);
    // Carry riders explicitly: CharacterMovement's base tracking handles most of it, but an explicit delta avoids
    // the one-frame lag that lets fast lifts drop the pawn.
    for (ATerraPlayerCharacter* Rider : Riders)
    {
        if (Rider)
        {
            Rider->AddActorWorldOffset(Delta, false, nullptr, ETeleportType::None);
        }
    }
    if (FMath::IsNearlyEqual(CurrentZ + Step, TargetZ, 0.5f))
    {
        CurrentFloor = TargetFloor;
        bMoving = false;
        DwellRemaining = DoorDwellSeconds;
    }
}

// ------------------------------------------------------------------------------------------------ parkour zone

ATerraParkourZone::ATerraParkourZone()
{
    PrimaryActorTick.bCanEverTick = false;
    Zone = CreateDefaultSubobject<UBoxComponent>(TEXT("Zone"));
    SetRootComponent(Zone);
    Zone->SetBoxExtent(FVector(1000.0f, 1000.0f, 400.0f));
    Zone->SetCollisionProfileName(TEXT("TerraTriggerVolume"));
    Zone->SetGenerateOverlapEvents(true);
}

void ATerraParkourZone::BeginPlay()
{
    Super::BeginPlay();
    Zone->OnComponentBeginOverlap.AddDynamic(this, &ATerraParkourZone::OnZoneBeginOverlap);
    Zone->OnComponentEndOverlap.AddDynamic(this, &ATerraParkourZone::OnZoneEndOverlap);
}

void ATerraParkourZone::OnZoneBeginOverlap(UPrimitiveComponent*, AActor* Other, UPrimitiveComponent*, int32, bool, const FHitResult&)
{
    if (ATerraPlayerCharacter* C = Cast<ATerraPlayerCharacter>(Other))
    {
        C->SetParkourZone(this);
    }
}

void ATerraParkourZone::OnZoneEndOverlap(UPrimitiveComponent*, AActor* Other, UPrimitiveComponent*, int32)
{
    if (ATerraPlayerCharacter* C = Cast<ATerraPlayerCharacter>(Other))
    {
        if (C->GetParkourZone() == this)
        {
            C->SetParkourZone(nullptr);
        }
    }
}

// ------------------------------------------------------------------------------------------------ rooftop railing

ATerraRooftopRailing::ATerraRooftopRailing()
{
    PrimaryActorTick.bCanEverTick = false;
    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);
}

void ATerraRooftopRailing::BuildAlongEdge(const TArray<FVector>& EdgePoints, float HeightCm)
{
    for (UBoxComponent* Seg : Segments)
    {
        if (Seg)
        {
            Seg->DestroyComponent();
        }
    }
    Segments.Reset();
    const int32 N = EdgePoints.Num();
    if (N < 2)
    {
        return;
    }
    for (int32 i = 0; i < N; ++i)
    {
        const FVector A = EdgePoints[i];
        const FVector B = EdgePoints[(i + 1) % N];
        const FVector Mid = (A + B) * 0.5;
        const double Len = FVector::Dist(A, B);
        if (Len < 1.0)
        {
            continue;
        }
        UBoxComponent* Seg = NewObject<UBoxComponent>(this);
        Seg->SetupAttachment(GetRootComponent());
        Seg->RegisterComponent();
        Seg->SetWorldLocation(Mid + FVector(0, 0, HeightCm * 0.5f));
        Seg->SetWorldRotation(FRotationMatrix::MakeFromX(B - A).Rotator());
        Seg->SetBoxExtent(FVector(Len * 0.5, 5.0, HeightCm * 0.5));
        Seg->SetCollisionProfileName(TEXT("TerraInteriorWall"));
        Seg->SetHiddenInGame(true); // invisible: the visible railing mesh is decorative, this is the guarantee
        Segments.Add(Seg);
    }
}
