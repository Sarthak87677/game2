// Terra Infinite runtime module.
// STATUS: scaffolded in a sandbox without Unreal Engine or a GPU. This module has never been compiled; the first
// build on a real workstation (UE 5.4+, VS 2022 / Xcode 15) is expected to surface include and API mismatches,
// most likely against the Cesium for Unreal version installed. See docs/UNREAL.md, "Verification gates".
using UnrealBuildTool;

public class TerraInfinite : ModuleRules
{
    public TerraInfinite(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        IWYUSupport = IWYUSupport.Full;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore",
            "EnhancedInput",
            "DeveloperSettings",
            // Chaos vehicles (AWheeledVehiclePawn, UChaosWheeledVehicleMovementComponent)
            "ChaosVehicles",
            "ChaosVehiclesCore",
            "PhysicsCore",
            // Cesium for Unreal (ACesiumGeoreference, UCesiumGlobeAnchorComponent, ACesium3DTileset)
            "CesiumRuntime",
            // Data tables are loaded from JSON at run time
            "Json",
            "JsonUtilities",
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "RHI",
            "RenderCore",
            "Niagara",
            "Slate",
            "SlateCore",
            "UMG",
        });

        // Mass crowds/traffic are configured as data assets in the editor; no C++ dependency is taken here so the
        // module still links when the optional MassTraffic plugin (City Sample) is absent.
    }
}
