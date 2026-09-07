// Volumes the character reacts to: elevators (vertical carriage between floors), parkour zones (jump assist +
// ledge mantling), and rooftop railings (invisible walls at every walkable roof edge - there is no falling off).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TerraMovementVolumes.generated.h"

class UBoxComponent;
class UStaticMeshComponent;
class ATerraPlayerCharacter;

/** Elevator: a box cabin that carries overlapping pawns between floor heights (metres above its base). */
UCLASS()
class TERRAINFINITE_API ATerraElevatorVolume : public AActor
{
    GENERATED_BODY()

public:
    ATerraElevatorVolume();
    virtual void Tick(float DeltaSeconds) override;

    /** Floor heights relative to the actor base, in metres (floor 0 = 0). */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Elevator") TArray<float> FloorHeightsM = { 0.0f, 3.2f, 6.4f };
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Elevator") float SpeedMps = 1.5f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Elevator") float DoorDwellSeconds = 2.0f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Elevator") FString DisplayName = TEXT("Lift");

    UFUNCTION(BlueprintCallable, Category = "Terra|Elevator") void CallToFloor(int32 Floor);
    UFUNCTION(BlueprintCallable, Category = "Terra|Elevator") void CallNextFloor();
    UFUNCTION(BlueprintPure, Category = "Terra|Elevator") int32 GetCurrentFloor() const { return CurrentFloor; }
    UFUNCTION(BlueprintPure, Category = "Terra|Elevator") bool IsMoving() const { return bMoving; }

    UBoxComponent* GetCabin() const { return Cabin; }

protected:
    virtual void BeginPlay() override;

private:
    UFUNCTION() void OnCabinBeginOverlap(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep);
    UFUNCTION() void OnCabinEndOverlap(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex);

    UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Cabin;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Floor;
    UPROPERTY() TArray<TObjectPtr<ATerraPlayerCharacter>> Riders;
    FVector BaseLocation = FVector::ZeroVector;
    int32 CurrentFloor = 0;
    int32 TargetFloor = 0;
    bool bMoving = false;
    float DwellRemaining = 0.0f;
};

/** Parkour zone: inside it the character gets a higher jump, forward assist and ledge mantling. */
UCLASS()
class TERRAINFINITE_API ATerraParkourZone : public AActor
{
    GENERATED_BODY()

public:
    ATerraParkourZone();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Parkour", meta = (ClampMin = "1.0")) float JumpHeightMultiplier = 1.6f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Parkour", meta = (ClampMin = "0.0")) float ForwardAssistMps = 2.5f;
    /** Highest ledge (metres) the character can mantle onto from a jump. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Terra|Parkour", meta = (ClampMin = "0.5")) float MantleHeightM = 1.8f;

    UBoxComponent* GetZone() const { return Zone; }

protected:
    virtual void BeginPlay() override;

private:
    UFUNCTION() void OnZoneBeginOverlap(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep);
    UFUNCTION() void OnZoneEndOverlap(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex);

    UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Zone;
};

/** Rooftop railing: an invisible blocking wall. Interiors/campus generators place one along every roof edge. */
UCLASS()
class TERRAINFINITE_API ATerraRooftopRailing : public AActor
{
    GENERATED_BODY()

public:
    ATerraRooftopRailing();

    /** Rebuilds the wall segments along a closed polygon of roof-edge points (world space, cm). */
    UFUNCTION(BlueprintCallable, Category = "Terra|Safety") void BuildAlongEdge(const TArray<FVector>& EdgePoints, float HeightCm = 120.0f);

private:
    UPROPERTY(VisibleAnywhere) TArray<TObjectPtr<UBoxComponent>> Segments;
};
