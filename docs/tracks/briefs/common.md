You are one of several parallel engineering sessions building Terra Infinite (repository Sarthak87677/game2, branch `main`). The
shared plan and integration contract is `docs/PLAN_MAHARASHTRA.md` — read it first, then `docs/PROJECT_STATUS.md`,
`docs/ARCHITECTURE.md`, `src/gameplay/types.ts`, `src/gameplay/GameplayHost.ts`, `src/modes/ModeController.ts`,
`src/engine/TerraEngine.ts` and the existing e2e specs in `tests/e2e/` before writing code.

Non-negotiable rules:
- Work only in the files your track owns (table in docs/PLAN_MAHARASHTRA.md) plus one registration line in
  `src/gameplay/registry.ts` and, if you add data, one export line in `src/data/maharashtra/index.ts`. Do not refactor
  shared files; if a contract is missing something, add a small, additive, optional hook and document it in the plan.
- Never label procedural/fictional/approximate content as real, surveyed or exact. Every generated interior, campus,
  landmark body, timetable, ticket, vehicle or route carries a visible note. Coordinates from memory are approximate
  and say so in a `dataNote`.
- No credentials in source, no paid services, no copied branded assets/logos/maps/characters/UI, no GTA content.
- Non-violent, family-safe: no weapons, injuries, crime, gambling, drugs, alcohol interactions. Rooftops have railings
  and fade-to-respawn.
- Never fake a feature. Something is "done" only when `npm run typecheck && npm run lint && npm test` pass, an e2e
  spec drives it through `window.__terra` in headless Chromium and passes, and a screenshot in `docs/screenshots/`
  shows it. Otherwise list it under "broken" or "next" in your PROJECT_STATUS section.
- The sandbox has no GPU (SwiftShader, 0.5–10 fps) and blocks OSM/Overpass/Nominatim hosts; use
  `TERRA_FIXTURES=1 npm run dev` / `?terraFixtures=1` for synthetic OSM, `?terraQuality=low`, and
  `scripts/dev/probe-scene.mjs` for scripted screenshots (see how tests/e2e specs and scripts/dev/*.mjs launch Chromium:
  `--use-angle=swiftshader`, `PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK=1`, `--ssl-version-max=tls1.2`).
  Start the dev server with `nohup npx vite --host 127.0.0.1 --port <port> &` (never `pkill -f`).
- Cesium gotchas already learned: Entities with per-frame positions never render — use Primitives with a modelMatrix
  updated each frame; a GeometryInstance with a modelMatrix is baked (rebuild instead of re-assigning
  `primitive.modelMatrix`); canvases cannot be fabric uniform defaults (use `Material.DefaultImageId` then assign);
  build ground-level meshes in tile-local ENU frames; keep heavy generation in workers or off the frame.
- Commit early and often on your branch with clear messages, run the checks before each commit, and push with
  `git push -u origin <your-branch>`. Never push to `main`. Do not open pull requests.
- Keep `docs/PROJECT_STATUS.md` honest: add/replace a section for your track with Completed / Tested (how) / Broken /
  Next. Add licences/sources of anything new to `docs/ATTRIBUTIONS.md` and `docs/DATA_SOURCES.md`.
- Performance budget for every system: no per-frame allocations in hot loops, pooled objects, distance-based LOD and
  simulation (full simulation only within ~300 m of the player, statistical beyond), unload when far. Provide
  `stats()` for the Diagnostics panel.
- When done, write a final summary (what works, what is verified, what is not, files touched) in
  `docs/tracks/<track>.md` and push. Then stop.
