export function HelpPanel() {
  return (
    <div className="terra-panel-body terra-helppanel">
      <h3>Exploring</h3>
      <ul>
        <li><b>Orbit (1)</b>: left-drag rotate · right-drag / wheel zoom · middle-drag tilt · touch: one finger rotate, pinch zoom, two-finger tilt.</li>
        <li><b>Fly (2)</b>: click the globe to capture the mouse, look around, <b>W A S D</b> move, <b>Q/E</b> down/up, <b>Shift</b> boost, <b>[ ]</b> speed, gamepad sticks.</li>
        <li><b>Walk (3)</b>: gravity and terrain collision, <b>Space</b> jump, <b>Shift</b> run, <b>V</b> third person.</li>
        <li><b>Drive (4)</b>: <b>W</b> accelerate, <b>S</b> brake/reverse, <b>A/D</b> steer, <b>Space</b> handbrake.</li>
        <li><b>Tour (5)</b>: cinematic orbit of the current view; showcase areas have curated tours. <b>Esc</b> exits.</li>
        <li><b>/</b> or <b>F</b> search · <b>H</b> hide interface · <b>P</b> screenshot (toolbar).</li>
      </ul>
      <h3>What is real?</h3>
      <p>Terrain, coastlines, rivers, country borders and place names are measured datasets. Biomes and climate are inferred from a model. Vegetation, rocks, generic buildings and weather are procedural: geographically plausible, deterministic per location, but not surveyed. The Data panel lists every source and its licence.</p>
    </div>
  );
}
