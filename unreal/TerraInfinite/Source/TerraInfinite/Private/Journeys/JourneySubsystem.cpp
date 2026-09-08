#include "Journeys/JourneySubsystem.h"
#include "TerraInfinite.h"
#include "Core/TerraGameSettings.h"
#include "Core/TerraPlayerController.h"
#include "Data/TerraDataSubsystem.h"
#include "Geo/TerraGeo.h"
#include "Player/TerraPlayerCharacter.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/SpringArmComponent.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"
#include "Algo/Reverse.h"

// ------------------------------------------------------------------------------------------------ vessel

ATerraJourneyVessel::ATerraJourneyVessel()
{
    PrimaryActorTick.bCanEverTick = false;
    Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
    SetRootComponent(Body);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    if (Cube.Succeeded())
    {
        Body->SetStaticMesh(Cube.Object);
    }
    Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    PassengerArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("PassengerArm"));
    PassengerArm->SetupAttachment(Body);
    PassengerArm->TargetArmLength = 0.0f;
    PassengerArm->bUsePawnControlRotation = false;
    PassengerArm->bInheritPitch = false;
    PassengerArm->bInheritRoll = false;
    PassengerCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("PassengerCamera"));
    PassengerCamera->SetupAttachment(PassengerArm, USpringArmComponent::SocketName);
}

void ATerraJourneyVessel::Configure(ETerraJourneyKind Kind)
{
    // Stand-in bodies (metres): train coach, narrow-body aircraft, ferry. Labelled procedural in the HUD.
    switch (Kind)
    {
    case ETerraJourneyKind::Rail: Body->SetRelativeScale3D(FVector(22.0f, 3.0f, 3.8f)); PassengerArm->SetRelativeLocation(FVector(0, 120, 160)); break;
    case ETerraJourneyKind::Air: Body->SetRelativeScale3D(FVector(38.0f, 4.0f, 4.0f)); PassengerArm->SetRelativeLocation(FVector(0, 190, 120)); break;
    case ETerraJourneyKind::Marine: Body->SetRelativeScale3D(FVector(30.0f, 8.0f, 3.0f)); PassengerArm->SetRelativeLocation(FVector(0, 0, 420)); break;
    }
}

// ------------------------------------------------------------------------------------------------ subsystem

static FAutoConsoleCommandWithWorldAndArgs GTerraTrainCmd(
    TEXT("terra.Journey.Train"),
    TEXT("terra.Journey.Train <corridorId> [reverse] - board a train on a RailCorridors.json row."),
    FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
    {
        if (UJourneySubsystem* J = World ? World->GetSubsystem<UJourneySubsystem>() : nullptr)
        {
            if (Args.Num() >= 1) J->BoardTrain(Args[0], !(Args.Num() >= 2 && Args[1] == TEXT("reverse")));
        }
    }));

static FAutoConsoleCommandWithWorldAndArgs GTerraFlightCmd(
    TEXT("terra.Journey.Flight"),
    TEXT("terra.Journey.Flight <fromAirportId> <toAirportId>"),
    FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
    {
        if (UJourneySubsystem* J = World ? World->GetSubsystem<UJourneySubsystem>() : nullptr)
        {
            if (Args.Num() >= 2) J->BoardFlight(Args[0], Args[1]);
        }
    }));

static FAutoConsoleCommandWithWorldAndArgs GTerraFerryCmd(
    TEXT("terra.Journey.Ferry"),
    TEXT("terra.Journey.Ferry <waterRouteId>"),
    FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
    {
        if (UJourneySubsystem* J = World ? World->GetSubsystem<UJourneySubsystem>() : nullptr)
        {
            if (Args.Num() >= 1) J->BoardVessel(Args[0]);
        }
    }));

static FAutoConsoleCommandWithWorld GTerraAlightCmd(
    TEXT("terra.Journey.Alight"), TEXT("Leave the current journey at the next stop."),
    FConsoleCommandWithWorldDelegate::CreateLambda([](UWorld* World)
    {
        if (UJourneySubsystem* J = World ? World->GetSubsystem<UJourneySubsystem>() : nullptr) J->Alight();
    }));

static UTerraDataSubsystem* DataOf(UWorld* World)
{
    UGameInstance* GI = World ? World->GetGameInstance() : nullptr;
    return GI ? GI->GetSubsystem<UTerraDataSubsystem>() : nullptr;
}

static double CruiseSpeedFor(const FString& Service)
{
    if (Service == TEXT("suburban")) return 70.0;
    if (Service == TEXT("metro")) return 60.0;
    if (Service == TEXT("heritage")) return 25.0;
    return 110.0; // intercity
}

bool UJourneySubsystem::BoardTrain(const FString& CorridorId, bool bForward)
{
    UTerraDataSubsystem* Data = DataOf(GetWorld());
    const FTerraRailCorridorRow* Corridor = Data ? Data->FindRailCorridor(CorridorId) : nullptr;
    if (!Corridor || Corridor->Path.Num() < 2)
    {
        UE_LOG(LogTerra, Warning, TEXT("Rail corridor %s not found (RailCorridors.json rows: %d)"), *CorridorId, Data ? Data->GetRailCorridors().Num() : 0);
        return false;
    }
    TArray<FTerraGeoPoint> P = Corridor->Path;
    TArray<FString> Stops = Corridor->StationIds;
    if (!bForward)
    {
        Algo::Reverse(P);
        Algo::Reverse(Stops);
    }
    FTerraJourneyTicket Ticket;
    Ticket.Kind = ETerraJourneyKind::Rail;
    Ticket.RouteId = Corridor->Name;
    Ticket.RouteName = Corridor->DisplayName;
    FTerraStationRow From, To;
    Ticket.FromName = Stops.Num() && Data->FindStation(Stops[0], From) ? From.DisplayName : TEXT("origin");
    Ticket.ToName = Stops.Num() && Data->FindStation(Stops.Last(), To) ? To.DisplayName : TEXT("terminus");
    Ticket.Seat = FString::Printf(TEXT("Coach %c, seat %d"), TCHAR('A' + (FMath::Abs(GetTypeHash(CorridorId)) % 6)), 1 + FMath::Abs(GetTypeHash(CorridorId) >> 3) % 72);
    Ticket.Note = UTerraGameSettings::Get()->ProceduralContentNote;
    return StartJourney(ETerraJourneyKind::Rail, P, Ticket, CruiseSpeedFor(Corridor->Service), 0.0);
}

bool UJourneySubsystem::BoardFlight(const FString& FromAirportId, const FString& ToAirportId)
{
    UTerraDataSubsystem* Data = DataOf(GetWorld());
    FTerraAirportRow From, To;
    if (!Data || !Data->FindAirport(FromAirportId, From) || !Data->FindAirport(ToAirportId, To))
    {
        UE_LOG(LogTerra, Warning, TEXT("Airports %s/%s not found"), *FromAirportId, *ToAirportId);
        return false;
    }
    // Great-circle path sampled into 32 segments; the runway heading orients take-off and landing.
    TArray<FTerraGeoPoint> P;
    const double Lat1 = FMath::DegreesToRadians(From.Lat), Lon1 = FMath::DegreesToRadians(From.Lon);
    const double Lat2 = FMath::DegreesToRadians(To.Lat), Lon2 = FMath::DegreesToRadians(To.Lon);
    const double D = 2.0 * FMath::Asin(FMath::Sqrt(FMath::Square(FMath::Sin((Lat2 - Lat1) * 0.5)) + FMath::Cos(Lat1) * FMath::Cos(Lat2) * FMath::Square(FMath::Sin((Lon2 - Lon1) * 0.5))));
    for (int32 i = 0; i <= 32; ++i)
    {
        const double F = i / 32.0;
        if (D < 1e-9) { P.Add(FTerraGeoPoint(From.Lat, From.Lon)); continue; }
        const double A = FMath::Sin((1 - F) * D) / FMath::Sin(D), B = FMath::Sin(F * D) / FMath::Sin(D);
        const double X = A * FMath::Cos(Lat1) * FMath::Cos(Lon1) + B * FMath::Cos(Lat2) * FMath::Cos(Lon2);
        const double Y = A * FMath::Cos(Lat1) * FMath::Sin(Lon1) + B * FMath::Cos(Lat2) * FMath::Sin(Lon2);
        const double Z = A * FMath::Sin(Lat1) + B * FMath::Sin(Lat2);
        P.Add(FTerraGeoPoint(FMath::RadiansToDegrees(FMath::Atan2(Z, FMath::Sqrt(X * X + Y * Y))), FMath::RadiansToDegrees(FMath::Atan2(Y, X))));
    }
    FTerraJourneyTicket Ticket;
    Ticket.Kind = ETerraJourneyKind::Air;
    Ticket.RouteId = From.Name + TEXT("->") + To.Name;
    Ticket.RouteName = FString::Printf(TEXT("%s - %s"), *From.Iata, *To.Iata);
    Ticket.FromName = From.DisplayName;
    Ticket.ToName = To.DisplayName;
    Ticket.Seat = FString::Printf(TEXT("Seat %d%c"), 3 + FMath::Abs(GetTypeHash(Ticket.RouteId)) % 28, TCHAR('A' + FMath::Abs(GetTypeHash(ToAirportId)) % 6));
    Ticket.Note = UTerraGameSettings::Get()->ProceduralContentNote + TEXT(" Fictional flight, no real airline.");
    const double DistanceM = D * 6371008.8;
    const double CruiseAlt = FMath::Clamp(DistanceM / 40.0, 1500.0, 11000.0); // short hops stay low
    return StartJourney(ETerraJourneyKind::Air, P, Ticket, 780.0, CruiseAlt);
}

bool UJourneySubsystem::BoardVessel(const FString& WaterRouteId)
{
    UTerraDataSubsystem* Data = DataOf(GetWorld());
    const FTerraWaterRouteRow* Route = Data ? Data->FindWaterRoute(WaterRouteId) : nullptr;
    if (!Route || Route->Path.Num() < 2)
    {
        UE_LOG(LogTerra, Warning, TEXT("Water route %s not found"), *WaterRouteId);
        return false;
    }
    FTerraJourneyTicket Ticket;
    Ticket.Kind = ETerraJourneyKind::Marine;
    Ticket.RouteId = Route->Name;
    Ticket.RouteName = Route->DisplayName;
    FTerraPortRow From, To;
    Ticket.FromName = Data->FindPort(Route->FromPortId, From) ? From.DisplayName : Route->FromPortId;
    Ticket.ToName = Data->FindPort(Route->ToPortId, To) ? To.DisplayName : Route->ToPortId;
    Ticket.Seat = Route->Vessel == TEXT("cruise") ? TEXT("Upper deck") : TEXT("Open deck");
    Ticket.Note = UTerraGameSettings::Get()->ProceduralContentNote;
    const double Kph = Route->Vessel == TEXT("speedboat") ? 55.0 : Route->Vessel == TEXT("cruise") ? 30.0 : 22.0;
    return StartJourney(ETerraJourneyKind::Marine, Route->Path, Ticket, Kph, 0.0);
}

bool UJourneySubsystem::StartJourney(ETerraJourneyKind Kind, const TArray<FTerraGeoPoint>& InPath, const FTerraJourneyTicket& Ticket, double InCruiseKph, double InCruiseAltM)
{
    if (IsTravelling())
    {
        UE_LOG(LogTerra, Warning, TEXT("Already travelling"));
        return false;
    }
    if (!FTerraGeo::Georeference(GetWorld()))
    {
        return false;
    }
    Path = InPath;
    CumulativeM.Reset();
    TotalM = 0.0;
    CumulativeM.Add(0.0);
    for (int32 i = 1; i < Path.Num(); ++i)
    {
        TotalM += Path[i - 1].DistanceM(Path[i]);
        CumulativeM.Add(TotalM);
    }
    if (TotalM < 10.0)
    {
        return false;
    }
    CruiseKph = InCruiseKph;
    CruiseAltM = InCruiseAltM;
    TravelledM = 0.0;
    bAlightRequested = false;

    if (!Vessel)
    {
        Vessel = GetWorld()->SpawnActor<ATerraJourneyVessel>(ATerraJourneyVessel::StaticClass(), FTransform::Identity);
    }
    Vessel->Configure(Kind);
    Status = FTerraJourneyStatus();
    Status.Ticket = Ticket;
    Status.Ticket.DurationSeconds = static_cast<float>(TotalM / (CruiseKph / 3.6) * 1.15);
    Status.NextStopName = Ticket.ToName;
    MoveVessel(SampleRoute(0.0), SampleRoute(0.001));
    EnterPassengerMode();
    SetState(ETerraJourneyState::Boarding);
    UE_LOG(LogTerra, Log, TEXT("Journey %s: %s -> %s, %.1f km, ~%.0f s. %s"), *Ticket.RouteName, *Ticket.FromName, *Ticket.ToName, TotalM / 1000.0, Status.Ticket.DurationSeconds, *Ticket.Note);
    return true;
}

void UJourneySubsystem::SetState(ETerraJourneyState NewState)
{
    Status.State = NewState;
    StateTimer = 0.0;
}

UJourneySubsystem::FRouteSample UJourneySubsystem::SampleRoute(double T) const
{
    FRouteSample S{ 0, 0, 0 };
    if (Path.Num() == 0) return S;
    const double Target = FMath::Clamp(T, 0.0, 1.0) * TotalM;
    int32 i = 1;
    while (i < CumulativeM.Num() - 1 && CumulativeM[i] < Target) ++i;
    const double SegLen = FMath::Max(1e-6, CumulativeM[i] - CumulativeM[i - 1]);
    const double F = FMath::Clamp((Target - CumulativeM[i - 1]) / SegLen, 0.0, 1.0);
    S.Lat = FMath::Lerp(Path[i - 1].Lat, Path[i].Lat, F);
    S.Lon = FMath::Lerp(Path[i - 1].Lon, Path[i].Lon, F);
    if (Status.Ticket.Kind == ETerraJourneyKind::Air)
    {
        // Climb over the first 15 %, descend over the last 15 %, smoothstep profile.
        const double Climb = FMath::SmoothStep(0.0, 0.15, T);
        const double Descent = 1.0 - FMath::SmoothStep(0.85, 1.0, T);
        double Ground = 0.0;
        FTerraGeo::SampleGroundHeight(GetWorld(), S.Lat, S.Lon, Ground, 20000.0);
        S.HeightM = Ground + 2.0 + CruiseAltM * FMath::Min(Climb, Descent);
    }
    else if (Status.Ticket.Kind == ETerraJourneyKind::Marine)
    {
        S.HeightM = 0.5; // sea level (ellipsoid approx.); water surface actor sits at 0
    }
    else
    {
        double Ground = 0.0;
        FTerraGeo::SampleGroundHeight(GetWorld(), S.Lat, S.Lon, Ground);
        S.HeightM = Ground + 0.3;
    }
    return S;
}

double UJourneySubsystem::SpeedProfileKph(double T) const
{
    // Accelerate over 8 %, cruise, brake over the last 8 %; trains also slow near intermediate stations (skipped:
    // intermediate stops are a follow-up once station positions are matched to the path).
    const double A = FMath::SmoothStep(0.0, 0.08, T);
    const double B = 1.0 - FMath::SmoothStep(0.92, 1.0, T);
    return CruiseKph * FMath::Max(0.05, FMath::Min(A, B));
}

void UJourneySubsystem::MoveVessel(const FRouteSample& S, const FRouteSample& Ahead)
{
    FVector Pos, PosAhead;
    if (!Vessel || !FTerraGeo::ToUnreal(GetWorld(), S.Lat, S.Lon, S.HeightM, Pos) || !FTerraGeo::ToUnreal(GetWorld(), Ahead.Lat, Ahead.Lon, Ahead.HeightM, PosAhead))
    {
        return;
    }
    const FVector Up = FTerraGeo::Up(GetWorld(), Pos);
    const FVector Fwd = (PosAhead - Pos).GetSafeNormal();
    const FRotator Rot = Fwd.IsNearlyZero() ? Vessel->GetActorRotation() : FRotationMatrix::MakeFromXZ(Fwd, Up).Rotator();
    Vessel->SetActorLocationAndRotation(Pos, Rot, false, nullptr, ETeleportType::None);
    Status.Lat = S.Lat;
    Status.Lon = S.Lon;
    Status.AltitudeM = S.HeightM;
}

void UJourneySubsystem::EnterPassengerMode()
{
    APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
    Passenger = PC ? Cast<ATerraPlayerCharacter>(PC->GetPawn()) : nullptr;
    if (Passenger)
    {
        Passenger->SetParked(true);
    }
    if (PC && Vessel)
    {
        PC->SetViewTargetWithBlend(Vessel, 0.5f);
        // Free-look: the passenger arm follows the controller's yaw/pitch relative to the vessel.
        Vessel->GetPassengerArm()->bUsePawnControlRotation = true;
    }
    if (ATerraPlayerController* TPC = Cast<ATerraPlayerController>(PC))
    {
        TPC->ShowNotice(FString::Printf(TEXT("%s: %s -> %s. %s. %s"), *Status.Ticket.RouteName, *Status.Ticket.FromName, *Status.Ticket.ToName, *Status.Ticket.Seat, *Status.Ticket.Note));
    }
}

void UJourneySubsystem::LeavePassengerMode()
{
    APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
    if (Passenger && Vessel)
    {
        // Alight beside the vessel on the ground.
        double Lat, Lon, H;
        if (FTerraGeo::ToGeographic(GetWorld(), Vessel->GetActorLocation(), Lat, Lon, H))
        {
            double Ground = H;
            FTerraGeo::SampleGroundHeight(GetWorld(), Lat, Lon, Ground);
            Passenger->PlaceAtGeographic(Lat, Lon + 0.00005, Ground + 1.0, 90.0);
        }
        Passenger->SetParked(false);
    }
    if (PC && Passenger)
    {
        PC->SetViewTargetWithBlend(Passenger, 0.5f);
    }
    Passenger = nullptr;
}

void UJourneySubsystem::Alight()
{
    bAlightRequested = true;
    if (Status.State == ETerraJourneyState::Boarding || Status.State == ETerraJourneyState::Alighted)
    {
        SetState(ETerraJourneyState::Alighted);
        StateTimer = 999.0;
    }
}

void UJourneySubsystem::FastForward()
{
    if (IsTravelling())
    {
        TravelledM = TotalM * 0.93;
        SetState(ETerraJourneyState::Arriving);
    }
}

void UJourneySubsystem::Tick(float DeltaTime)
{
    if (!IsTravelling())
    {
        return;
    }
    StateTimer += DeltaTime;
    switch (Status.State)
    {
    case ETerraJourneyState::Boarding:
        if (StateTimer > 3.0) SetState(ETerraJourneyState::Departing);
        break;
    case ETerraJourneyState::Departing:
    case ETerraJourneyState::EnRoute:
    case ETerraJourneyState::Arriving:
    {
        const double T = TotalM > 0 ? TravelledM / TotalM : 1.0;
        const double Kph = SpeedProfileKph(T);
        TravelledM = FMath::Min(TotalM, TravelledM + Kph / 3.6 * DeltaTime);
        Status.SpeedKph = static_cast<float>(Kph);
        Status.Progress01 = static_cast<float>(TravelledM / TotalM);
        MoveVessel(SampleRoute(Status.Progress01), SampleRoute(FMath::Min(1.0, Status.Progress01 + 0.002)));
        if (Status.State == ETerraJourneyState::Departing && T > 0.08) SetState(ETerraJourneyState::EnRoute);
        if (Status.State == ETerraJourneyState::EnRoute && T > 0.92) SetState(ETerraJourneyState::Arriving);
        if (TravelledM >= TotalM - 0.01)
        {
            Status.SpeedKph = 0.0f;
            SetState(ETerraJourneyState::Alighted);
        }
        break;
    }
    case ETerraJourneyState::Alighted:
        if (StateTimer > 2.0 || bAlightRequested)
        {
            LeavePassengerMode();
            if (Vessel)
            {
                Vessel->Destroy();
                Vessel = nullptr;
            }
            Status.State = ETerraJourneyState::Idle;
            UE_LOG(LogTerra, Log, TEXT("Journey complete: arrived at %s"), *Status.Ticket.ToName);
        }
        break;
    default:
        break;
    }
}
