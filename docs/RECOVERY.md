# Recovery report — the three `undefined.scene` errors

Reproduced and root-caused on 2026-09-05 with `scripts/dev/capture-exceptions.mjs`, which loads the app in headless
Chromium and pauses on **every** thrown exception through the Chrome DevTools Protocol (caught exceptions included),
recording call frames and async stacks. Two builds were compared side by side:

| Build | Toasts | Diagnostics errors | Engines in DOM |
|---|---|---|---|
| `c11254e` (before the fix — the build in the reported screenshots) | Imagery procedural failed / World map failed / Gazetteer failed: `TypeError: Cannot read properties of undefined (reading 'scene')` + `Ground material unavailable: Illegal constructor` | 5 | 1 (a second engine had been created and destroyed) |
| `8ff7c63` and later (`main`) | none | 0 | 1 |

## Root cause (with the captured stack)

```
TypeError: Cannot read properties of undefined (reading 'scene')
    get @ cesium.js:286647            ← Viewer.imageryLayers getter on a DESTROYED viewer
    get @ cesium.js:286696
    setImagery @ src/engine/TerraEngine.ts:237
    [async] refreshImagery @ TerraEngine.ts:208 <- loadDataInBackground @ TerraEngine.ts:176
    [async] create @ TerraEngine.ts:166
    [async] <App> @ src/App.tsx:18  <- react_stack_bottom_frame (react-dom)
```

1. **Two engines per page in development.** React 19 `StrictMode` mounts, unmounts and re-mounts every effect in
   development. `App.tsx` created a `TerraEngine` (and a Cesium `Viewer`) in the effect and destroyed it in the cleanup,
   so the first engine was destroyed a few milliseconds after creation while its background loaders (Natural Earth →
   imagery refresh, gazetteer → night lights, climate atlas → ground material) were still running. Every later access
   to `viewer.imageryLayers` / `viewer.scene` on the destroyed viewer threw inside Cesium's getters — reported as
   "Imagery procedural failed", "World map failed" and "Gazetteer failed". The production build (no StrictMode double
   invoke) did not show this, which is why the sandbox tests passed while the laptop failed.
2. **Ground material `Illegal constructor`.** Cesium deep-clones a material's fabric; a `<canvas>` used as a uniform
   default made the clone call `new HTMLCanvasElement()`, which browsers forbid. The material was skipped, leaving
   the flat, unlit globe in the screenshots.
3. **"ready" shown although layers had failed** because the boot phase only tracked the loader sequence, not success.

## Fixes (on `main`)

* `src/App.tsx` — one engine per container, shared across StrictMode remounts with a delayed disposer (`acquireEngine`
  / `releaseEngine`).
* `src/engine/TerraEngine.ts` — `destroyed` guards in every asynchronous loader; render-error recovery with bounded
  restarts; stack traces stored in the diagnostics log.
* `src/engine/groundMaterial.ts` — `Material.DefaultImageId` placeholders, canvases assigned to `material.uniforms`
  after construction.
* Build stamp (`build <commit>`) in the HUD footer so a screenshot identifies its build; the reported screenshots
  predate `2f914ac`.
* Readiness gating (ready only when required layers are up and the frame rate is above the preset minimum) is
  implemented by the `perf` track — see `docs/PLAN_MAHARASHTRA.md`.

## Verification

* `capture-exceptions.mjs` on `main`: 0 diagnostics, 0 toasts, boot phase `ready` after data loaded.
* Playwright smoke tests (`tests/e2e/smoke.spec.ts`) assert no "Render error" or "failed" diagnostics after walking,
  third person and driving.
* Remaining exceptions captured on `main` are internal to Cesium and swallowed by it (AMD shim probing during module
  init, and a `DOMPurify` receiver check inside `CreditDisplay`); they do not surface as errors and are identical on
  both builds.

## Machine audit (cloud sandbox used for this work)

| Item | Value |
|---|---|
| CPU | Intel Xeon @ 2.10 GHz, 4 logical cores |
| RAM | 15 GB |
| GPU | none (no PCI GPU, no `/dev/dri`) — Chromium renders with SwiftShader software GL |
| Unreal Engine | **not installed** (no `UnrealEditor`, no Epic launcher, no UE toolchain) |
| Network | proxy blocks OpenStreetMap/Overpass/Nominatim/Esri/GIBS hosts; S3 terrain reachable but intermittently reset |
| Node / toolchain | Node 22.22, npm 10.9, clang 18 |

Consequences: the Unreal client can only be scaffolded and documented here; frame-rate targets (60/30 fps at 1080p)
cannot be measured on real hardware from this environment. Both facts are stated wherever numbers appear.
