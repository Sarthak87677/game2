// Terra Infinite - game target. Scaffolded without an Unreal install; not yet compiled (see docs/UNREAL.md).
using UnrealBuildTool;
using System.Collections.Generic;

public class TerraInfiniteTarget : TargetRules
{
    public TerraInfiniteTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
        ExtraModuleNames.AddRange(new string[] { "TerraInfinite" });
    }
}
