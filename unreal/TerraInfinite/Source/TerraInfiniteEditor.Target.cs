// Terra Infinite - editor target. Scaffolded without an Unreal install; not yet compiled (see docs/UNREAL.md).
using UnrealBuildTool;
using System.Collections.Generic;

public class TerraInfiniteEditorTarget : TargetRules
{
    public TerraInfiniteEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
        ExtraModuleNames.AddRange(new string[] { "TerraInfinite" });
    }
}
