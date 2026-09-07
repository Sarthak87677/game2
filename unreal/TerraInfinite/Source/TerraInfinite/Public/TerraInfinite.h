// Terra Infinite runtime module. Scaffolded without an Unreal install - not yet compiled (docs/UNREAL.md).
#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

TERRAINFINITE_API DECLARE_LOG_CATEGORY_EXTERN(LogTerra, Log, All);

class FTerraInfiniteModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
};
