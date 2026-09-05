import { useEffect, useRef } from 'react';
import { useEngine } from '../EngineContext';
import { useTerraStore } from '@/state/store';
import { BIOME_INFO } from '@/world/climate/biome';
import { BIOME_LIST } from '@/world/biomes';

const W = 220;
const H = 110;

/** Equirectangular overview rendered from the WorldMap raster with the camera position and heading. */
export function MiniMap() {
  const engine = useEngine();
  const camera = useTerraStore((s) => s.camera);
  const worldReady = useTerraStore((s) => s.dataFlags.worldMap);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = baseRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const wm = engine?.worldMap;
    const img = ctx.createImageData(W, H);
    const pal = BIOME_LIST.map((b) => {
      const h = BIOME_INFO[b].groundPalette.base.replace('#', '');
      const v = parseInt(h, 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      let rgb = [20, 40, 70];
      if (wm) {
        const lat = 90 - ((y + 0.5) / H) * 180;
        const lon = ((x + 0.5) / W) * 360 - 180;
        const i = wm.index(lat, lon);
        const s = wm.data.surface[i];
        if (s === 1) rgb = pal[wm.data.biome[i]] ?? rgb;
        else if (s === 2) rgb = [40, 90, 140];
        else if (s === 3) rgb = [230, 236, 244];
        else rgb = [18, 38, 68];
      }
      img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [engine, worldReady]);

  useEffect(() => {
    const c = overlayRef.current;
    if (!c || !camera) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const x = ((camera.lon + 180) / 360) * W;
    const y = ((90 - camera.lat) / 180) * H;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((camera.headingDeg * Math.PI) / 180);
    ctx.fillStyle = '#ff5a4e';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4, 5); ctx.lineTo(0, 3); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }, [camera]);

  return (
    <div className="terra-minimap" title="World overview (inferred biome atlas) — click to fly there" role="button" tabIndex={0} aria-label="World overview map; click a point to fly there"
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && engine && camera) { e.preventDefault(); void engine.goTo({ lat: camera.lat, lon: camera.lon, heightM: 2_500_000, pitchDeg: -90 }, { descend: false }); } }}
      onClick={(e) => {
      if (!engine) return;
      const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const lon = ((e.clientX - r.left) / r.width) * 360 - 180;
      const lat = 90 - ((e.clientY - r.top) / r.height) * 180;
      void engine.goTo({ lat, lon, heightM: 2_500_000, pitchDeg: -90 }, { descend: false });
    }}>
      <canvas ref={baseRef} width={W} height={H} />
      <canvas ref={overlayRef} width={W} height={H} className="terra-minimap-overlay" />
    </div>
  );
}
