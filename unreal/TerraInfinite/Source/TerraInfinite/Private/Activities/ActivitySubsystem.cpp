#include "Activities/ActivitySubsystem.h"
#include "TerraInfinite.h"
#include "Core/TerraGameSettings.h"
#include "Core/TerraPlayerController.h"
#include "Data/TerraDataSubsystem.h"
#include "Geo/TerraGeo.h"
#include "Journeys/JourneySubsystem.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"
#include "Math/RandomStream.h"

static TAutoConsoleVariable<float> CVarSimFullRadiusM(TEXT("terra.Sim.FullRadiusM"), 300.0f, TEXT("Full simulation radius; beyond it activities are statistical."));

void UActivitySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    Collection.InitializeDependency<UGeoStreamingSubsystem>();
    RegisterDataTableInteractions();
    if (UGeoStreamingSubsystem* Streaming = GetWorld()->GetSubsystem<UGeoStreamingSubsystem>())
    {
        Streaming->RegisterProducer(this);
    }
}

void UActivitySubsystem::Deinitialize()
{
    if (UWorld* World = GetWorld())
    {
        if (UGeoStreamingSubsystem* Streaming = World->GetSubsystem<UGeoStreamingSubsystem>())
        {
            Streaming->UnregisterProducer(this);
        }
    }
    Super::Deinitialize();
}

void UActivitySubsystem::RegisterDataTableInteractions()
{
    UGameInstance* GI = GetWorld()->GetGameInstance();
    UTerraDataSubsystem* Data = GI ? GI->GetSubsystem<UTerraDataSubsystem>() : nullptr;
    if (!Data)
    {
        return;
    }
    const FString Note = UTerraGameSettings::Get()->ProceduralContentNote;
    TWeakObjectPtr<UWorld> WeakWorld = GetWorld();

    // Stations: board the first corridor that lists the station (forward if it is not the last stop).
    for (const FTerraStationRow& Station : Data->GetStations())
    {
        for (const FTerraRailCorridorRow& Corridor : Data->GetRailCorridors())
        {
            const int32 Index = Corridor.StationIds.IndexOfByKey(Station.Name);
            if (Index == INDEX_NONE) continue;
            const bool bForward = Index < Corridor.StationIds.Num() - 1;
            FTerraInteraction I;
            I.Id = FString::Printf(TEXT("board:%s:%s"), *Station.Name, *Corridor.Name);
            I.Label = FString::Printf(TEXT("Board %s (%s)"), *Corridor.DisplayName, bForward ? TEXT("onward") : TEXT("return"));
            I.Lat = Station.Lat; I.Lon = Station.Lon; I.RadiusM = 60.0f; I.Priority = 5; I.Note = Note;
            const FString CorridorId = Corridor.Name;
            I.Run.BindLambda([WeakWorld, CorridorId, bForward]()
            {
                if (UJourneySubsystem* J = WeakWorld.IsValid() ? WeakWorld->GetSubsystem<UJourneySubsystem>() : nullptr) J->BoardTrain(CorridorId, bForward);
            });
            RegisterInteraction(I);
        }
    }
    // Airports: fly to every other airport (nearest first is the HUD's job; each is an interaction).
    for (const FTerraAirportRow& From : Data->GetAirports())
    {
        for (const FTerraAirportRow& To : Data->GetAirports())
        {
            if (From.Name == To.Name) continue;
            FTerraInteraction I;
            I.Id = FString::Printf(TEXT("fly:%s:%s"), *From.Name, *To.Name);
            I.Label = FString::Printf(TEXT("Fly to %s (%s)"), *To.City, *To.Iata);
            I.Lat = From.Terminal.Lat; I.Lon = From.Terminal.Lon; I.RadiusM = 80.0f; I.Priority = 4; I.Note = Note;
            const FString A = From.Name, B = To.Name;
            I.Run.BindLambda([WeakWorld, A, B]()
            {
                if (UJourneySubsystem* J = WeakWorld.IsValid() ? WeakWorld->GetSubsystem<UJourneySubsystem>() : nullptr) J->BoardFlight(A, B);
            });
            RegisterInteraction(I);
        }
    }
    // Ports: water routes leaving this port.
    for (const FTerraWaterRouteRow& Route : Data->GetWaterRoutes())
    {
        FTerraPortRow From;
        if (!Data->FindPort(Route.FromPortId, From)) continue;
        FTerraInteraction I;
        I.Id = FString::Printf(TEXT("sail:%s"), *Route.Name);
        I.Label = FString::Printf(TEXT("Board %s to %s"), *Route.Vessel, *Route.ToPortId);
        I.Lat = From.Lat; I.Lon = From.Lon; I.RadiusM = 40.0f; I.Priority = 4; I.Note = Note;
        const FString RouteId = Route.Name;
        I.Run.BindLambda([WeakWorld, RouteId]()
        {
            if (UJourneySubsystem* J = WeakWorld.IsValid() ? WeakWorld->GetSubsystem<UJourneySubsystem>() : nullptr) J->BoardVessel(RouteId);
        });
        RegisterInteraction(I);
    }
    // Destinations: an "About" card with the data note (provenance is always one key press away).
    for (const FTerraDestinationRow& D : Data->GetDestinations())
    {
        FTerraInteraction I;
        I.Id = FString::Printf(TEXT("about:%s"), *D.Name);
        I.Label = FString::Printf(TEXT("About %s"), *D.DisplayName);
        I.Lat = D.Lat; I.Lon = D.Lon; I.RadiusM = 30.0f; I.Priority = 1; I.Note = D.DataNote;
        const FString Text = FString::Printf(TEXT("%s - %s (%s)"), *D.DisplayName, *D.Description, *D.DataNote);
        I.Run.BindLambda([WeakWorld, Text]()
        {
            if (ATerraPlayerController* PC = WeakWorld.IsValid() ? Cast<ATerraPlayerController>(UGameplayStatics::GetPlayerController(WeakWorld.Get(), 0)) : nullptr) PC->ShowNotice(Text);
        });
        RegisterInteraction(I);
    }
    UE_LOG(LogTerra, Log, TEXT("Registered %d data-table interactions"), Interactions.Num());
}

void UActivitySubsystem::RegisterInteraction(const FTerraInteraction& Interaction)
{
    UnregisterInteraction(Interaction.Id);
    Interactions.Add(Interaction);
}

void UActivitySubsystem::UnregisterInteraction(const FString& Id)
{
    Interactions.RemoveAll([&Id](const FTerraInteraction& I) { return I.Id == Id; });
}

const FTerraInteraction* UActivitySubsystem::FindNearest(APawn* Pawn) const
{
    double Lat, Lon, H;
    if (!Pawn || !FTerraGeo::ToGeographic(GetWorld(), Pawn->GetActorLocation(), Lat, Lon, H))
    {
        return nullptr;
    }
    const FTerraGeoPoint Here(Lat, Lon);
    const FTerraInteraction* Best = nullptr;
    double BestScore = TNumericLimits<double>::Max();
    for (const FTerraInteraction& I : Interactions)
    {
        // Cheap reject before the trig: 1 degree ~ 111 km.
        if (FMath::Abs(I.Lat - Lat) > 0.01 || FMath::Abs(I.Lon - Lon) > 0.01) continue;
        const double D = Here.DistanceM(FTerraGeoPoint(I.Lat, I.Lon));
        if (D > I.RadiusM) continue;
        const double Score = D - I.Priority * 1000.0;
        if (Score < BestScore)
        {
            BestScore = Score;
            Best = &I;
        }
    }
    return Best;
}

FString UActivitySubsystem::NearestInteractionLabel(APawn* Pawn)
{
    const FTerraInteraction* I = FindNearest(Pawn);
    return I ? I->Label : FString();
}

bool UActivitySubsystem::RunNearestInteraction(APawn* Pawn)
{
    const FTerraInteraction* I = FindNearest(Pawn);
    if (!I || !I->Run.IsBound())
    {
        return false;
    }
    UE_LOG(LogTerra, Log, TEXT("Interaction: %s (%s)"), *I->Label, *I->Note);
    FTerraInteractionRun Run = I->Run; // copy: Run may unregister interactions
    Run.Execute();
    return true;
}

bool UActivitySubsystem::StartActivity(const FString& Id)
{
    const int32 Index = Activities.IndexOfByPredicate([&Id](const FTerraActivity& A) { return A.Id == Id; });
    if (Index == INDEX_NONE || ActiveIndex != -1)
    {
        return false;
    }
    ActiveIndex = Index;
    Activities[Index].State = ETerraActivityState::Active;
    Activities[Index].Elapsed = 0.0f;
    if (ATerraPlayerController* PC = Cast<ATerraPlayerController>(UGameplayStatics::GetPlayerController(GetWorld(), 0)))
    {
        PC->ShowNotice(FString::Printf(TEXT("%s. %s"), *Activities[Index].Title, *Activities[Index].Note));
    }
    return true;
}

void UActivitySubsystem::StopActivity()
{
    if (Activities.IsValidIndex(ActiveIndex))
    {
        Activities[ActiveIndex].State = ETerraActivityState::Available;
    }
    ActiveIndex = -1;
}

FTerraActivityStats UActivitySubsystem::GetStats() const
{
    FTerraActivityStats S;
    S.Interactions = Interactions.Num();
    S.Activities = Activities.Num();
    S.Completed = Completed;
    S.ActiveActivity = Activities.IsValidIndex(ActiveIndex) ? Activities[ActiveIndex].Title : FString();
    return S;
}

int32 UActivitySubsystem::OnCellLoad(const FTerraCell& Cell)
{
    // Deterministic per-cell activity seeding: 0-2 generic activities depending on the cell seed. Real placement
    // (near parks, beaches, maidans) needs OSM land-use from the data track; until then these are demo markers
    // and they say so in their note.
    FRandomStream Rng(static_cast<int32>(Cell.Seed & 0x7FFFFFFF));
    const int32 Count = Rng.RandRange(0, 2);
    static const TCHAR* Kinds[] = { TEXT("cricket-nets"), TEXT("kite"), TEXT("tea-stall"), TEXT("photo-spot"), TEXT("walk-tour"), TEXT("bird-watching") };
    static const TCHAR* Titles[] = { TEXT("Cricket nets"), TEXT("Fly a kite"), TEXT("Tea stall chat"), TEXT("Photo spot"), TEXT("Heritage walk"), TEXT("Bird watching") };
    TArray<FString>& Ids = IdsByCell.FindOrAdd(Cell.Key);
    const double HalfDeg = Cell.SizeM * 0.5 / FTerraGeo::MetresPerDegreeLat();
    TWeakObjectPtr<UActivitySubsystem> WeakThis = this;
    for (int32 i = 0; i < Count; ++i)
    {
        const int32 K = Rng.RandRange(0, UE_ARRAY_COUNT(Kinds) - 1);
        FTerraActivity A;
        A.Id = FString::Printf(TEXT("act:%d:%d:%d"), Cell.Key.X, Cell.Key.Y, i);
        A.Kind = Kinds[K];
        A.Title = Titles[K];
        A.Lat = Cell.Lat + Rng.FRandRange(-HalfDeg, HalfDeg);
        A.Lon = Cell.Lon + Rng.FRandRange(-HalfDeg, HalfDeg) / FMath::Max(0.1, FMath::Cos(FMath::DegreesToRadians(Cell.Lat)));
        A.DurationSeconds = Rng.FRandRange(20.0f, 60.0f);
        A.Note = TEXT("Demo activity marker placed procedurally; not a real venue.");
        Activities.Add(A);
        FTerraInteraction I;
        I.Id = A.Id;
        I.Label = A.Title;
        I.Lat = A.Lat; I.Lon = A.Lon; I.RadiusM = 8.0f; I.Priority = 2; I.Note = A.Note;
        const FString ActId = A.Id;
        I.Run.BindLambda([WeakThis, ActId]() { if (WeakThis.IsValid()) WeakThis->StartActivity(ActId); });
        RegisterInteraction(I);
        Ids.Add(A.Id);
    }
    return Count;
}

void UActivitySubsystem::OnCellUnload(const FTerraCell& Cell)
{
    TArray<FString> Ids;
    if (!IdsByCell.RemoveAndCopyValue(Cell.Key, Ids))
    {
        return;
    }
    for (const FString& Id : Ids)
    {
        UnregisterInteraction(Id);
        const int32 Index = Activities.IndexOfByPredicate([&Id](const FTerraActivity& A) { return A.Id == Id; });
        if (Index != INDEX_NONE)
        {
            if (Index == ActiveIndex) StopActivity();
            else if (ActiveIndex > Index) --ActiveIndex;
            Activities.RemoveAt(Index);
        }
    }
}

void UActivitySubsystem::Tick(float DeltaTime)
{
    if (!Activities.IsValidIndex(ActiveIndex))
    {
        return;
    }
    FTerraActivity& A = Activities[ActiveIndex];
    // Full simulation only near the player: walking away beyond the radius abandons the activity.
    APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
    double Lat, Lon, H;
    if (Pawn && FTerraGeo::ToGeographic(GetWorld(), Pawn->GetActorLocation(), Lat, Lon, H))
    {
        if (FTerraGeoPoint(Lat, Lon).DistanceM(FTerraGeoPoint(A.Lat, A.Lon)) > CVarSimFullRadiusM.GetValueOnGameThread())
        {
            StopActivity();
            return;
        }
    }
    A.Elapsed += DeltaTime;
    if (A.Elapsed >= A.DurationSeconds)
    {
        A.State = ETerraActivityState::Done;
        ++Completed;
        ActiveIndex = -1;
        if (ATerraPlayerController* PC = Cast<ATerraPlayerController>(UGameplayStatics::GetPlayerController(GetWorld(), 0)))
        {
            PC->ShowNotice(FString::Printf(TEXT("%s - done"), *A.Title));
        }
    }
}
