#include "TerraInfinite.h"
#include "Misc/EngineVersion.h"

DEFINE_LOG_CATEGORY(LogTerra);

void FTerraInfiniteModule::StartupModule()
{
    UE_LOG(LogTerra, Log, TEXT("Terra Infinite module starting (engine %s). Content is procedural/approximate unless labelled measured."),
        *FEngineVersion::Current().ToString());
}

void FTerraInfiniteModule::ShutdownModule()
{
    UE_LOG(LogTerra, Log, TEXT("Terra Infinite module shut down"));
}

IMPLEMENT_PRIMARY_GAME_MODULE(FTerraInfiniteModule, TerraInfinite, "TerraInfinite");
