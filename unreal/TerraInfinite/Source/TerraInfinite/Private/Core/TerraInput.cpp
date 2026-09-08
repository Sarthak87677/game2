#include "Core/TerraInput.h"
#include "TerraInfinite.h"
#include "InputModifiers.h"

const FName UTerraInputConfig::Move(TEXT("Move"));
const FName UTerraInputConfig::Look(TEXT("Look"));
const FName UTerraInputConfig::LookGamepad(TEXT("LookGamepad"));
const FName UTerraInputConfig::Jump(TEXT("Jump"));
const FName UTerraInputConfig::Run(TEXT("Run"));
const FName UTerraInputConfig::Interact(TEXT("Interact"));
const FName UTerraInputConfig::EnterExitVehicle(TEXT("EnterExitVehicle"));
const FName UTerraInputConfig::CameraCycle(TEXT("CameraCycle"));
const FName UTerraInputConfig::Horn(TEXT("Horn"));
const FName UTerraInputConfig::Lights(TEXT("Lights"));
const FName UTerraInputConfig::IndicatorLeft(TEXT("IndicatorLeft"));
const FName UTerraInputConfig::IndicatorRight(TEXT("IndicatorRight"));
const FName UTerraInputConfig::Hazards(TEXT("Hazards"));
const FName UTerraInputConfig::Wipers(TEXT("Wipers"));
const FName UTerraInputConfig::Handbrake(TEXT("Handbrake"));
const FName UTerraInputConfig::ResetVehicle(TEXT("ResetVehicle"));
const FName UTerraInputConfig::Diagnostics(TEXT("Diagnostics"));
const FName UTerraInputConfig::Pause(TEXT("Pause"));

void UTerraInputConfig::Build()
{
    const UTerraInputSettings* Settings = GetDefault<UTerraInputSettings>();
    ActionsByName.Reset();

    for (const FTerraInputActionSpec& Spec : Settings->Actions)
    {
        if (Spec.Name.IsNone() || ActionsByName.Contains(Spec.Name))
        {
            continue;
        }
        UInputAction* Action = NewObject<UInputAction>(this, Spec.Name);
        Action->ValueType = Spec.ValueType;
        Action->bConsumeInput = true;
        ActionsByName.Add(Spec.Name, Action);
    }

    if (!Settings->MappingContextOverride.IsNull())
    {
        MappingContext = Settings->MappingContextOverride.LoadSynchronous();
        if (MappingContext)
        {
            UE_LOG(LogTerra, Log, TEXT("Using mapping context override %s"), *MappingContext->GetName());
            return;
        }
    }

    MappingContext = NewObject<UInputMappingContext>(this, TEXT("IMC_TerraGenerated"));
    int32 Bound = 0;
    for (const FTerraInputBindingSpec& Binding : Settings->Bindings)
    {
        UInputAction* Action = FindAction(Binding.Action);
        if (!Action || !Binding.Key.IsValid())
        {
            UE_LOG(LogTerra, Warning, TEXT("Input binding skipped: action %s key %s"), *Binding.Action.ToString(), *Binding.Key.ToString());
            continue;
        }
        FEnhancedActionKeyMapping& Mapping = MappingContext->MapKey(Action, Binding.Key);
        if (Binding.Axis == ETerraInputAxis::Y)
        {
            // A 1-D key produces X; swizzle so the value lands on Y (forward/back).
            UInputModifierSwizzleAxis* Swizzle = NewObject<UInputModifierSwizzleAxis>(MappingContext);
            Swizzle->Order = EInputAxisSwizzle::YXZ;
            Mapping.Modifiers.Add(Swizzle);
        }
        if (Binding.bNegate)
        {
            UInputModifierNegate* Negate = NewObject<UInputModifierNegate>(MappingContext);
            Negate->bX = true; Negate->bY = true; Negate->bZ = true;
            Mapping.Modifiers.Add(Negate);
        }
        if (Binding.bNegateY)
        {
            UInputModifierNegate* Negate = NewObject<UInputModifierNegate>(MappingContext);
            Negate->bX = false; Negate->bY = true; Negate->bZ = false;
            Mapping.Modifiers.Add(Negate);
        }
        ++Bound;
    }
    UE_LOG(LogTerra, Log, TEXT("Generated Enhanced Input context: %d actions, %d bindings"), ActionsByName.Num(), Bound);
}

UInputAction* UTerraInputConfig::FindAction(FName Name) const
{
    const TObjectPtr<UInputAction>* Found = ActionsByName.Find(Name);
    return Found ? Found->Get() : nullptr;
}
