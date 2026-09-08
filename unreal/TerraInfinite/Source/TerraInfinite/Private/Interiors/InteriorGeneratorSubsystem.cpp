#include "Interiors/InteriorGeneratorSubsystem.h"
#include "TerraInfinite.h"
#include "Core/TerraGameSettings.h"
#include "Data/TerraDataSubsystem.h"
#include "Geo/TerraGeo.h"
#include "Player/TerraMovementVolumes.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "LevelInstance/LevelInstanceActor.h"
#include "HAL/PlatformTime.h"
#include "Math/RandomStream.h"

// ------------------------------------------------------------------------------------------------ subsystem

void UInteriorGeneratorSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    Collection.InitializeDependency<UGeoStreamingSubsystem>();
    if (UGeoStreamingSubsystem* Streaming = GetWorld()->GetSubsystem<UGeoStreamingSubsystem>())
    {
        Streaming->RegisterProducer(this);
    }
}

void UInteriorGeneratorSubsystem::Deinitialize()
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

int64 UInteriorGeneratorSubsystem::SeedFor(double Lat, double Lon, const FString& Category)
{
    // 1e-5 deg (~1 m) quantisation so tiny float differences between clients do not change the layout.
    const int64 QLat = FMath::RoundToInt64(Lat * 100000.0);
    const int64 QLon = FMath::RoundToInt64(Lon * 100000.0);
    uint64 Z = static_cast<uint64>(QLat) * 0x9E3779B97F4A7C15ULL ^ static_cast<uint64>(QLon) * 0xC2B2AE3D27D4EB4FULL ^ static_cast<uint64>(GetTypeHash(Category));
    Z = (Z ^ (Z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    Z = (Z ^ (Z >> 27)) * 0x94D049BB133111EBULL;
    Z = Z ^ (Z >> 31);
    return static_cast<int64>(Z & 0x7FFFFFFFFFFFFFFFULL);
}

FTerraInteriorGrammarRow UInteriorGeneratorSubsystem::GrammarFor(const FString& Category) const
{
    FTerraInteriorGrammarRow Row;
    UGameInstance* GI = GetWorld() ? GetWorld()->GetGameInstance() : nullptr;
    UTerraDataSubsystem* Data = GI ? GI->GetSubsystem<UTerraDataSubsystem>() : nullptr;
    if (Data && (Data->FindGrammar(Category, Row) || Data->FindGrammar(TEXT("generic"), Row)))
    {
        return Row;
    }
    // Built-in defaults until the interiors track ships InteriorGrammar.json rows.
    Row.Name = Row.Category = Category;
    Row.FloorHeightM = 3.2;
    Row.CorridorWidthM = 2.4;
    Row.RoomMinM = 3.5;
    Row.RoomMaxM = 9.0;
    if (Category == TEXT("library")) Row.RoomTypes = { TEXT("reading-room"), TEXT("stacks"), TEXT("study"), TEXT("desk") };
    else if (Category == TEXT("classroom-block")) Row.RoomTypes = { TEXT("classroom"), TEXT("classroom"), TEXT("staff-room"), TEXT("lab") };
    else if (Category == TEXT("hostel")) Row.RoomTypes = { TEXT("dorm"), TEXT("dorm"), TEXT("common-room"), TEXT("warden") };
    else if (Category == TEXT("station")) Row.RoomTypes = { TEXT("ticket-hall"), TEXT("waiting-room"), TEXT("office") };
    else Row.RoomTypes = { TEXT("office"), TEXT("meeting"), TEXT("store"), TEXT("lobby") };
    Row.DataNote = UTerraGameSettings::Get()->ProceduralContentNote;
    return Row;
}

FTerraInteriorPlan UInteriorGeneratorSubsystem::Plan(const FTerraInteriorRequest& Request)
{
    const double Start = FPlatformTime::Seconds();
    const FTerraInteriorGrammarRow Grammar = GrammarFor(Request.Category);
    FTerraInteriorPlan Out;
    Out.Category = Request.Category;
    Out.Seed = SeedFor(Request.Lat, Request.Lon, Request.Category);
    Out.WidthM = FMath::Max(6.0, Request.WidthM);
    Out.DepthM = FMath::Max(6.0, Request.DepthM);
    Out.Floors = FMath::Clamp(Request.Floors, 1, 12);
    Out.FloorHeightM = Grammar.FloorHeightM;
    Out.CorridorWidthM = FMath::Min(Grammar.CorridorWidthM, Out.WidthM * 0.3);
    Out.DataNote = Grammar.DataNote.IsEmpty() ? UTerraGameSettings::Get()->ProceduralContentNote : Grammar.DataNote;

    FRandomStream Rng(static_cast<int32>(Out.Seed & 0x7FFFFFFF));

    // Corridor runs north-south through the middle third; rooms on both sides.
    Out.CorridorX = Out.WidthM * Rng.FRandRange(0.4, 0.6);
    const double LeftW = Out.CorridorX - Out.CorridorWidthM * 0.5;
    const double RightX0 = Out.CorridorX + Out.CorridorWidthM * 0.5;
    const double RightW = Out.WidthM - RightX0;

    // Stairs + lift take the north end of the corridor band.
    double UsableDepth = Out.DepthM;
    if (Out.Floors > 1)
    {
        const double StairDepth = 4.0;
        Out.StairMin = FVector2D(RightX0, Out.DepthM - StairDepth);
        Out.StairMax = FVector2D(FMath::Min(Out.WidthM, RightX0 + 3.0), Out.DepthM);
        UsableDepth -= StairDepth;
        if (Out.Floors > 2)
        {
            Out.bHasLift = true;
            Out.LiftMin = FVector2D(FMath::Max(0.0, LeftW - 2.2), Out.DepthM - 2.2);
            Out.LiftMax = FVector2D(LeftW, Out.DepthM);
        }
    }
    Out.EntranceX = Out.CorridorX;

    const int32 TypeCount = FMath::Max(1, Grammar.RoomTypes.Num());
    for (int32 Floor = 0; Floor < Out.Floors; ++Floor)
    {
        for (int32 Side = 0; Side < 2; ++Side)
        {
            const double X0 = Side == 0 ? 0.0 : RightX0;
            const double W = Side == 0 ? LeftW : RightW;
            if (W < Grammar.RoomMinM)
            {
                continue;
            }
            double Y = 0.0;
            const double Limit = (Floor > 0 || Side == 1) && Out.Floors > 1 ? UsableDepth : Out.DepthM;
            while (Y + Grammar.RoomMinM <= Limit)
            {
                double D = Rng.FRandRange(Grammar.RoomMinM, Grammar.RoomMaxM);
                if (Y + D > Limit || Limit - (Y + D) < Grammar.RoomMinM)
                {
                    D = Limit - Y; // last room absorbs the remainder
                }
                FTerraInteriorRoom Room;
                Room.Floor = Floor;
                Room.Type = Grammar.RoomTypes.Num() ? Grammar.RoomTypes[Rng.RandRange(0, TypeCount - 1)] : TEXT("room");
                Room.Min = FVector2D(X0, Y);
                Room.Max = FVector2D(X0 + W, Y + D);
                Room.Door = FVector2D(Side == 0 ? X0 + W : X0, Y + D * 0.5);
                Out.Rooms.Add(Room);
                Y += D;
            }
        }
    }
    Stats.PlansGenerated++;
    Stats.LastPlanMs = static_cast<float>((FPlatformTime::Seconds() - Start) * 1000.0);
    return Out;
}

void UInteriorGeneratorSubsystem::RegisterHeroLayout(const FString& Id, TSoftObjectPtr<UWorld> Level)
{
    HeroLayouts.Add(Id, Level);
}

AActor* UInteriorGeneratorSubsystem::Spawn(const FTerraInteriorRequest& Request)
{
    if (TObjectPtr<AActor>* Existing = SpawnedById.Find(Request.Id))
    {
        return Existing->Get();
    }
    FVector Origin;
    if (!FTerraGeo::ToUnreal(GetWorld(), Request.Lat, Request.Lon, Request.GroundHeightM, Origin))
    {
        UE_LOG(LogTerra, Warning, TEXT("Interior %s: no georeference"), *Request.Id);
        return nullptr;
    }
    FRotator Rot;
    FTerraGeo::HeadingToRotation(GetWorld(), Origin, Request.HeadingDeg, Rot);
    const FTransform Xf(Rot, Origin);

    TSoftObjectPtr<UWorld> Hero = Request.HandcraftedLevel;
    if (Hero.IsNull())
    {
        if (const TSoftObjectPtr<UWorld>* Registered = HeroLayouts.Find(Request.Id))
        {
            Hero = *Registered;
        }
    }
    AActor* Result = nullptr;
    if (!Hero.IsNull())
    {
        // Hand-crafted layout: a Level Instance streamed in at the georeferenced transform.
        FActorSpawnParameters Params;
        Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
        ALevelInstance* LI = GetWorld()->SpawnActorDeferred<ALevelInstance>(ALevelInstance::StaticClass(), Xf);
        if (LI)
        {
            LI->SetWorldAsset(Hero);
            LI->FinishSpawning(Xf);
            Result = LI;
            Stats.HeroLevelInstances++;
        }
    }
    else
    {
        const FTerraInteriorPlan ThePlan = Plan(Request);
        ATerraInteriorShell* Shell = GetWorld()->SpawnActor<ATerraInteriorShell>(ATerraInteriorShell::StaticClass(), Xf);
        if (Shell)
        {
            Shell->Build(ThePlan);
            for (const FTerraInteriorRoom& Room : ThePlan.Rooms)
            {
                FurnishRoom(Room, ThePlan, Shell);
            }
            Stats.WallInstances += Shell->GetInstanceCount();
            Result = Shell;
        }
    }
    if (Result)
    {
        SpawnedById.Add(Request.Id, Result);
        Stats.Spawned = SpawnedById.Num();
    }
    return Result;
}

void UInteriorGeneratorSubsystem::Despawn(const FString& Id)
{
    TObjectPtr<AActor> Actor;
    if (SpawnedById.RemoveAndCopyValue(Id, Actor) && Actor)
    {
        if (ATerraInteriorShell* Shell = Cast<ATerraInteriorShell>(Actor.Get()))
        {
            Stats.WallInstances -= Shell->GetInstanceCount();
        }
        Actor->Destroy();
    }
    Stats.Spawned = SpawnedById.Num();
}

void UInteriorGeneratorSubsystem::FurnishRoom(const FTerraInteriorRoom& Room, const FTerraInteriorPlan& ThePlan, ATerraInteriorShell* Shell)
{
    // SKELETON: props per room type (desks, shelves, beds) need original mesh assets that do not exist yet.
    // The plan already carries room types so the furnishing pass can be added without touching the generator.
    UE_LOG(LogTerra, VeryVerbose, TEXT("Furnish %s room (%.1fx%.1f m) on floor %d of %s - skipped (no prop assets yet)"),
        *Room.Type, Room.Max.X - Room.Min.X, Room.Max.Y - Room.Min.Y, Room.Floor, *ThePlan.Category);
    (void)Shell;
}

int32 UInteriorGeneratorSubsystem::OnCellLoad(const FTerraCell& Cell)
{
    UGameInstance* GI = GetWorld() ? GetWorld()->GetGameInstance() : nullptr;
    UTerraDataSubsystem* Data = GI ? GI->GetSubsystem<UTerraDataSubsystem>() : nullptr;
    UGeoStreamingSubsystem* Streaming = GetWorld()->GetSubsystem<UGeoStreamingSubsystem>();
    if (!Data || !Streaming)
    {
        return 0;
    }
    int32 Count = 0;
    TArray<FString>& Ids = IdsByCell.FindOrAdd(Cell.Key);
    for (const FTerraCampusBuildingRow& B : Data->GetCampusBuildings())
    {
        if (!(Streaming->KeyForGeographic(B.Lat, B.Lon) == Cell.Key))
        {
            continue;
        }
        FTerraInteriorRequest Req;
        Req.Id = B.Name;
        Req.Category = B.Category;
        Req.Lat = B.Lat;
        Req.Lon = B.Lon;
        Req.HeadingDeg = B.HeadingDeg;
        Req.WidthM = B.WidthM > 0 ? B.WidthM : 20.0;
        Req.DepthM = B.DepthM > 0 ? B.DepthM : 12.0;
        Req.Floors = FMath::Max(1, B.Floors);
        double Ground = 0.0;
        FTerraGeo::SampleGroundHeight(GetWorld(), B.Lat, B.Lon, Ground);
        Req.GroundHeightM = Ground;
        if (Spawn(Req))
        {
            Ids.Add(Req.Id);
            ++Count;
        }
    }
    return Count;
}

void UInteriorGeneratorSubsystem::OnCellUnload(const FTerraCell& Cell)
{
    TArray<FString> Ids;
    if (IdsByCell.RemoveAndCopyValue(Cell.Key, Ids))
    {
        for (const FString& Id : Ids)
        {
            Despawn(Id);
        }
    }
}

// ------------------------------------------------------------------------------------------------ shell actor

ATerraInteriorShell::ATerraInteriorShell()
{
    PrimaryActorTick.bCanEverTick = false;
    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);
    UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    auto MakeISM = [this, Cube](const TCHAR* Name) -> UInstancedStaticMeshComponent*
    {
        UInstancedStaticMeshComponent* C = CreateDefaultSubobject<UInstancedStaticMeshComponent>(Name);
        C->SetupAttachment(GetRootComponent());
        if (Cube) C->SetStaticMesh(Cube);
        C->SetCollisionProfileName(TEXT("TerraInteriorWall"));
        C->SetMobility(EComponentMobility::Static);
        C->NumCustomDataFloats = 1; // 0 = wall, 1 = floor, 2 = step (material can tint by this)
        return C;
    };
    Walls = MakeISM(TEXT("Walls"));
    Floors = MakeISM(TEXT("Floors"));
    Steps = MakeISM(TEXT("Steps"));
}

int32 ATerraInteriorShell::GetInstanceCount() const
{
    return Walls->GetInstanceCount() + Floors->GetInstanceCount() + Steps->GetInstanceCount();
}

void ATerraInteriorShell::AddBox(UInstancedStaticMeshComponent* Comp, const FVector& CentreM, const FVector& SizeM)
{
    // Engine cube is 100 cm; scale = size in metres.
    const FTransform Xf(FRotator::ZeroRotator, CentreM * 100.0, SizeM);
    Comp->AddInstance(Xf, false);
}

void ATerraInteriorShell::AddWallWithDoor(double X0, double Y0, double X1, double Y1, double Z0, double Height, double DoorAt, double DoorWidth)
{
    const double Thick = 0.2;
    const bool bAlongX = FMath::Abs(Y1 - Y0) < 1e-6;
    const double Len = bAlongX ? (X1 - X0) : (Y1 - Y0);
    const double Start = bAlongX ? X0 : Y0;
    auto Segment = [&](double S0, double S1)
    {
        if (S1 - S0 < 0.05) return;
        const double Mid = (S0 + S1) * 0.5;
        if (bAlongX) AddBox(Walls, FVector(Mid, Y0, Z0 + Height * 0.5), FVector(S1 - S0, Thick, Height));
        else AddBox(Walls, FVector(X0, Mid, Z0 + Height * 0.5), FVector(Thick, S1 - S0, Height));
    };
    if (DoorWidth <= 0.0)
    {
        Segment(Start, Start + Len);
        return;
    }
    const double D0 = FMath::Clamp(DoorAt - DoorWidth * 0.5, Start, Start + Len);
    const double D1 = FMath::Clamp(DoorAt + DoorWidth * 0.5, Start, Start + Len);
    Segment(Start, D0);
    Segment(D1, Start + Len);
    // Lintel above the door
    const double LintelH = Height - 2.1;
    if (LintelH > 0.05)
    {
        if (bAlongX) AddBox(Walls, FVector((D0 + D1) * 0.5, Y0, Z0 + 2.1 + LintelH * 0.5), FVector(D1 - D0, Thick, LintelH));
        else AddBox(Walls, FVector(X0, (D0 + D1) * 0.5, Z0 + 2.1 + LintelH * 0.5), FVector(Thick, D1 - D0, LintelH));
    }
}

void ATerraInteriorShell::Build(const FTerraInteriorPlan& InPlan)
{
    Plan = InPlan;
    Walls->ClearInstances();
    Floors->ClearInstances();
    Steps->ClearInstances();
    const double W = Plan.WidthM, D = Plan.DepthM, H = Plan.FloorHeightM;
    const double SlabT = 0.25;

    for (int32 F = 0; F < Plan.Floors; ++F)
    {
        const double Z0 = F * H;
        // Slab (with a hole for the stair well approximated by two slabs when stairs exist)
        if (Plan.Floors > 1 && F > 0)
        {
            const double HoleY0 = Plan.StairMin.Y;
            AddBox(Floors, FVector(W * 0.5, HoleY0 * 0.5, Z0 - SlabT * 0.5), FVector(W, HoleY0, SlabT));
            const double SideW = Plan.StairMin.X;
            if (SideW > 0.05) AddBox(Floors, FVector(SideW * 0.5, (HoleY0 + D) * 0.5, Z0 - SlabT * 0.5), FVector(SideW, D - HoleY0, SlabT));
            const double RightW = W - Plan.StairMax.X;
            if (RightW > 0.05) AddBox(Floors, FVector(Plan.StairMax.X + RightW * 0.5, (HoleY0 + D) * 0.5, Z0 - SlabT * 0.5), FVector(RightW, D - HoleY0, SlabT));
        }
        else
        {
            AddBox(Floors, FVector(W * 0.5, D * 0.5, Z0 - SlabT * 0.5), FVector(W, D, SlabT));
        }
        // Outer walls; the south wall carries the entrance on the ground floor.
        AddWallWithDoor(0, 0, W, 0, Z0, H, Plan.EntranceX, F == 0 ? 1.8 : 0.0);
        AddWallWithDoor(0, D, W, D, Z0, H, 0, 0);
        AddWallWithDoor(0, 0, 0, D, Z0, H, 0, 0);
        AddWallWithDoor(W, 0, W, D, Z0, H, 0, 0);
        // Room partitions: corridor walls with doors, and cross walls between rooms.
        for (const FTerraInteriorRoom& Room : Plan.Rooms)
        {
            if (Room.Floor != F) continue;
            const bool bLeft = Room.Max.X <= Plan.CorridorX + 1e-6;
            const double CorridorWallX = bLeft ? Room.Max.X : Room.Min.X;
            AddWallWithDoor(CorridorWallX, Room.Min.Y, CorridorWallX, Room.Max.Y, Z0, H, Room.Door.Y, 1.0);
            if (Room.Min.Y > 0.05) AddWallWithDoor(Room.Min.X, Room.Min.Y, Room.Max.X, Room.Min.Y, Z0, H, 0, 0);
        }
        // Stairs: straight flight of steps in the stair well, 17 cm risers.
        if (Plan.Floors > 1 && F < Plan.Floors - 1)
        {
            const int32 StepCount = FMath::CeilToInt(H / 0.17);
            const double Rise = H / StepCount;
            const double Run = (Plan.StairMax.Y - Plan.StairMin.Y) / StepCount;
            const double StepW = Plan.StairMax.X - Plan.StairMin.X;
            for (int32 S = 0; S < StepCount; ++S)
            {
                const double Y = Plan.StairMin.Y + (S + 0.5) * Run;
                const double Top = Z0 + (S + 1) * Rise;
                AddBox(Steps, FVector(Plan.StairMin.X + StepW * 0.5, Y, Top - Rise * 0.5), FVector(StepW, Run, Rise));
            }
        }
    }
    // Roof slab + railing around the roof edge (family-safe: no falling off rooftops).
    const double RoofZ = Plan.Floors * H;
    AddBox(Floors, FVector(W * 0.5, D * 0.5, RoofZ + SlabT * 0.5), FVector(W, D, SlabT));
    if (UTerraGameSettings::Get()->RooftopRailingsEverywhere)
    {
        ATerraRooftopRailing* Railing = GetWorld()->SpawnActor<ATerraRooftopRailing>(ATerraRooftopRailing::StaticClass(), GetActorTransform());
        if (Railing)
        {
            Railing->AttachToActor(this, FAttachmentTransformRules::KeepWorldTransform);
            const FTransform& Xf = GetActorTransform();
            TArray<FVector> Edge = {
                Xf.TransformPosition(FVector(0, 0, RoofZ + SlabT) * 100.0), Xf.TransformPosition(FVector(W, 0, RoofZ + SlabT) * 100.0),
                Xf.TransformPosition(FVector(W, D, RoofZ + SlabT) * 100.0), Xf.TransformPosition(FVector(0, D, RoofZ + SlabT) * 100.0) };
            Railing->BuildAlongEdge(Edge, 120.0f);
        }
    }
    // Lift
    if (Plan.bHasLift)
    {
        const FVector LiftCentre((Plan.LiftMin.X + Plan.LiftMax.X) * 0.5, (Plan.LiftMin.Y + Plan.LiftMax.Y) * 0.5, 0.0);
        const FTransform LiftXf(FRotator::ZeroRotator, GetActorTransform().TransformPosition(LiftCentre * 100.0));
        ATerraElevatorVolume* Lift = GetWorld()->SpawnActor<ATerraElevatorVolume>(ATerraElevatorVolume::StaticClass(), LiftXf);
        if (Lift)
        {
            Lift->AttachToActor(this, FAttachmentTransformRules::KeepWorldTransform);
            Lift->FloorHeightsM.Reset();
            for (int32 F = 0; F < Plan.Floors; ++F) Lift->FloorHeightsM.Add(static_cast<float>(F * H));
            Lift->DisplayName = FString::Printf(TEXT("Lift (%s)"), *Plan.Category);
        }
    }
}
