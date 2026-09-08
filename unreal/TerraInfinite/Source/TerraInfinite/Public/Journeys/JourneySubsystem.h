// Rail / air / marine journeys as one state machine over the shared data tables:
//   Idle -> Boarding -> Departing -> EnRoute -> Arriving -> Alighted -> Idle
// The vessel (train/aircraft/boat) is an ATerraJourneyVessel actor moved along the corridor/route polyline (or a
// great-circle arc with a climb/descent profile for flights). In passenger mode the player's view target becomes the
// vessel's passenger camera and the player can free-look; the character is parked like when driving.
// Timetables and tickets are fictional and every overlay says so (UTerraGameSettings::ProceduralContentNote).
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Data/TerraGeoPoint.h"
#include "JourneySubsystem.generated.h"

class ATerraJourneyVessel;
class ATerraPlayerCharacter;

UENUM(BlueprintType)
enum class ETerraJourneyKind : uint8 { Rail, Air, Marine };

UENUM(BlueprintType)
enum class ETerraJourneyState : uint8 { Idle, Boarding, Departing, EnRoute, Arriving, Alighted };

USTRUCT(BlueprintType)
struct FTerraJourneyTicket
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") ETerraJourneyKind Kind = ETerraJourneyKind::Rail;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString RouteId;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString RouteName;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString FromName;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString ToName;
    /** "coach"/"seat" text - fictional. */
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Seat;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float DurationSeconds = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString Note;
};

USTRUCT(BlueprintType)
struct FTerraJourneyStatus
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly, Category = "Terra") ETerraJourneyState State = ETerraJourneyState::Idle;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FTerraJourneyTicket Ticket;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float Progress01 = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") float SpeedKph = 0.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double Lat = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double Lon = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") double AltitudeM = 0.0;
    UPROPERTY(BlueprintReadOnly, Category = "Terra") FString NextStopName;
};

UCLASS()
class TERRAINFINITE_API UJourneySubsystem : public UTickableWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Tick(float DeltaTime) override;
    virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UJourneySubsystem, STATGROUP_Tickables); }
    virtual bool IsTickable() const override { return !IsTemplate() && GetWorld() && GetWorld()->IsGameWorld(); }

    /** Rail: corridor row id + direction (forward = station order in the row). */
    UFUNCTION(BlueprintCallable, Category = "Terra|Journeys") bool BoardTrain(const FString& CorridorId, bool bForward);
    /** Air: from/to airport row ids. Route is a great circle with climb/cruise/descent. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Journeys") bool BoardFlight(const FString& FromAirportId, const FString& ToAirportId);
    /** Marine: water route row id. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Journeys") bool BoardVessel(const FString& WaterRouteId);
    /** Leave at the next stop / immediately when stationary. */
    UFUNCTION(BlueprintCallable, Category = "Terra|Journeys") void Alight();
    /** Skip to the arrival (debug / benchmark). */
    UFUNCTION(BlueprintCallable, Category = "Terra|Journeys") void FastForward();

    UFUNCTION(BlueprintPure, Category = "Terra|Journeys") FTerraJourneyStatus GetStatus() const { return Status; }
    UFUNCTION(BlueprintPure, Category = "Terra|Journeys") bool IsTravelling() const { return Status.State != ETerraJourneyState::Idle; }

private:
    struct FRouteSample { double Lat, Lon, HeightM; };

    bool StartJourney(ETerraJourneyKind Kind, const TArray<FTerraGeoPoint>& Path, const FTerraJourneyTicket& Ticket, double CruiseKph, double CruiseAltM);
    void SetState(ETerraJourneyState NewState);
    FRouteSample SampleRoute(double T) const;
    double SpeedProfileKph(double T) const;
    void EnterPassengerMode();
    void LeavePassengerMode();
    void MoveVessel(const FRouteSample& S, const FRouteSample& Ahead);

    UPROPERTY() TObjectPtr<ATerraJourneyVessel> Vessel;
    UPROPERTY() TObjectPtr<ATerraPlayerCharacter> Passenger;
    FTerraJourneyStatus Status;
    TArray<FTerraGeoPoint> Path;
    TArray<double> CumulativeM;
    double TotalM = 0.0;
    double CruiseKph = 60.0;
    double CruiseAltM = 0.0;
    double TravelledM = 0.0;
    double StateTimer = 0.0;
    bool bAlightRequested = false;
};

/** The moving train/aircraft/boat. A primitive body until original vehicle assets exist; carries the passenger camera. */
UCLASS()
class TERRAINFINITE_API ATerraJourneyVessel : public AActor
{
    GENERATED_BODY()

public:
    ATerraJourneyVessel();
    void Configure(ETerraJourneyKind Kind);
    class UCameraComponent* GetPassengerCamera() const { return PassengerCamera; }
    class USpringArmComponent* GetPassengerArm() const { return PassengerArm; }

private:
    UPROPERTY(VisibleAnywhere) TObjectPtr<class UStaticMeshComponent> Body;
    UPROPERTY(VisibleAnywhere) TObjectPtr<class USpringArmComponent> PassengerArm;
    UPROPERTY(VisibleAnywhere) TObjectPtr<class UCameraComponent> PassengerCamera;
};
