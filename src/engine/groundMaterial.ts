import { Material, type Viewer } from 'cesium';
import { BIOME_INFO, type Biome } from '@/world/climate/biome';
import { BIOME_LIST } from '@/world/biomes';
import type { WorldMap } from '@/world/worldMap';

const GROUND_GLSL = /* glsl */ `
uniform sampler2D biomeMap;
uniform sampler2D palette;
uniform float fadeNear;
uniform float fadeFar;
uniform float wetness;
uniform float snowCover;
uniform float detailStrength;
uniform float seasonTint;
uniform float timeSec;
uniform float cloudCover;

float terraHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float terraNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = terraHash(i), b = terraHash(i + vec2(1.0, 0.0)), c = terraHash(i + vec2(0.0, 1.0)), d = terraHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float terraFbm(vec2 p) { float s = 0.0; float a = 0.5; for (int k = 0; k < 4; k++) { s += a * terraNoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }

/*
 * Lighting lives here rather than in Cesium's globe pass: Cesium only applies day/night shading to the globe when
 * the camera is more than lightingFadeOutDistance (10 000 km) away, and heightmap terrain carries no vertex normals,
 * so slopes would never shade. Screen-space derivatives give a per-triangle geometric normal at every distance.
 */
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec3 positionEC = -materialInput.positionToEyeEC;
  float dist = length(positionEC);
  float detail = (1.0 - smoothstep(fadeNear, fadeFar, dist)) * detailStrength;
  vec3 toEye = normalize(materialInput.positionToEyeEC);
  vec3 nFace = normalize(cross(dFdx(positionEC), dFdy(positionEC)));
  if (dot(nFace, toEye) < 0.0) nFace = -nFace;
  vec3 nEll = normalize(materialInput.normalEC);
  // Far away the facets of a coarse mesh flicker; blend toward the ellipsoid normal beyond ~300 km.
  nFace = normalize(mix(nFace, nEll, smoothstep(150000.0, 600000.0, dist)));
  float sunUp = dot(nEll, czm_lightDirectionEC);
  float daylight = smoothstep(-0.10, 0.12, sunUp);
  float lambert = max(dot(nFace, czm_lightDirectionEC), 0.0);
  float shading = mix(0.045, 1.0, daylight) * mix(1.0, 0.32 + 0.68 * lambert, daylight);
  if (detail <= 0.002) {
    // Detail faded out: darken whatever imagery is underneath by the shading factor (black overlay).
    material.diffuse = vec3(0.0);
    material.alpha = 1.0 - shading;
    return material;
  }
  float slopeFace = acos(clamp(dot(nFace, nEll), 0.0, 1.0));
  vec3 p = (czm_inverseView * vec4(positionEC, 1.0)).xyz;
  vec3 n = normalize(p);
  float lat = asin(clamp(n.z, -1.0, 1.0));
  float lon = atan(n.y, n.x);
  vec2 uv = vec2(lon / czm_twoPi + 0.5, 0.5 - lat / czm_pi);
  vec4 b = texture(biomeMap, uv);
  float biomeId = floor(b.r * 255.0 + 0.5);
  float surf = floor(b.a * 255.0 / 64.0);
  float pu = (biomeId + 0.5) / 32.0;
  vec3 base = texture(palette, vec2(pu, 0.125)).rgb;
  vec3 second = texture(palette, vec2(pu, 0.375)).rgb;
  vec3 rock = texture(palette, vec2(pu, 0.625)).rgb;
  vec3 snow = texture(palette, vec2(pu, 0.875)).rgb;
  vec3 east = normalize(vec3(-n.y, n.x, 0.0));
  vec3 north = cross(n, east);
  vec2 q = vec2(dot(p, east), dot(p, north));
  float n1 = terraFbm(q * 0.03);
  float n2 = terraFbm(q * 0.27 + 7.0);
  float n3 = terraNoise(materialInput.st * 96.0);
  float mixv = clamp(n1 * 0.55 + n2 * 0.35 + n3 * 0.1, 0.0, 1.0);
  vec3 color = mix(base, second, mixv);
  color *= 0.9 + 0.2 * n2;
  float slope = max(materialInput.slope, slopeFace);
  float height = materialInput.height;
  float rockAmount = smoothstep(0.5, 0.95, slope) + smoothstep(2300.0, 3900.0, height) * 0.55;
  color = mix(color, rock * (0.8 + 0.35 * n2), clamp(rockAmount, 0.0, 1.0));
  float snowline = 5200.0 - abs(lat) * 57.29578 * 60.0;
  float snowAmount = smoothstep(snowline - 450.0, snowline + 300.0, height) * (1.0 - smoothstep(0.85, 1.25, slope));
  snowAmount = max(snowAmount, snowCover * (0.6 + 0.4 * n1) * (1.0 - smoothstep(0.6, 1.2, slope)));
  if (surf > 2.5) snowAmount = 1.0;
  // Wind-sculpted snow: keep faint sastrugi/drift variation so snowfields never read as a flat sheet.
  vec3 snowShaded = snow * (0.88 + 0.12 * n2) * (0.95 + 0.05 * n1);
  color = mix(color, snowShaded, clamp(snowAmount, 0.0, 1.0));
  color = mix(color, color * vec3(1.05, 0.9, 0.7), clamp(seasonTint, 0.0, 1.0) * (1.0 - snowAmount));
  color *= 1.0 - 0.35 * wetness * (1.0 - snowAmount);
  // Ocean cells count as water only where the terrain is at or below sea level (coastal land inside a coarse
  // ocean cell keeps the land palette); lakes are water at any elevation.
  bool water = (surf < 0.5 && height < 0.5) || (surf > 1.5 && surf < 2.5);
  if (water) {
    float depth = max(0.0, -height);
    vec3 shallow = vec3(0.13, 0.42, 0.47);
    vec3 deep = vec3(0.015, 0.07, 0.17);
    vec3 wcol = mix(shallow, deep, clamp(depth / 70.0, 0.0, 1.0));
    float w = terraNoise(q * 0.45 + vec2(timeSec * 0.35, timeSec * 0.2)) * 0.5 + terraNoise(q * 1.6 - vec2(timeSec * 0.55, timeSec * 0.1)) * 0.5;
    wcol += (w - 0.5) * 0.06;
    vec3 h = normalize(toEye + czm_lightDirectionEC);
    float spec = pow(max(dot(nEll, h), 0.0), 80.0) * (0.5 + w) * daylight;
    wcol += spec * vec3(0.9, 0.95, 1.0) * 0.6;
    color = wcol;
  }
  // Cloud shadows: large, slowly drifting darkening patches proportional to cloud cover.
  if (cloudCover > 0.02) {
    float cs = terraFbm(q * 0.0009 + vec2(timeSec * 0.004, timeSec * 0.0017));
    float shadow = smoothstep(0.62 - cloudCover * 0.35, 0.78, cs) * cloudCover * 0.45;
    color *= 1.0 - shadow;
  }
  // Blend so that the result equals shading * mix(imagery, color, detail) without knowing the imagery colour:
  // alpha = detail + (1 - detail) * (1 - shading); diffuse = color * detail * shading / alpha.
  float alpha = detail + (1.0 - detail) * (1.0 - shading);
  material.diffuse = alpha > 0.0001 ? color * detail * shading / alpha : vec3(0.0);
  material.alpha = alpha;
  return material;
}
`;

export interface GroundMaterialHandle {
  material: Material;
  setUniform(name: 'fadeNear' | 'fadeFar' | 'wetness' | 'snowCover' | 'detailStrength' | 'seasonTint' | 'timeSec' | 'cloudCover', value: number): void;
  setWorldMap(map: WorldMap): void;
  destroy(): void;
}

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function buildPalette(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(32, 4);
  const put = (x: number, row: number, rgb: [number, number, number]) => {
    const p = (row * 32 + x) * 4;
    img.data[p] = Math.round(rgb[0] * 255); img.data[p + 1] = Math.round(rgb[1] * 255); img.data[p + 2] = Math.round(rgb[2] * 255); img.data[p + 3] = 255;
  };
  BIOME_LIST.forEach((b: Biome, i: number) => {
    const info = BIOME_INFO[b];
    const base = hexToRgb01(info.groundPalette.base);
    const second = hexToRgb01(info.groundPalette.secondary);
    put(i, 0, base);
    put(i, 1, second);
    put(i, 2, [0.48, 0.45, 0.42]);
    put(i, 3, [0.94, 0.95, 0.97]);
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function blankBiomeTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(9,0,0,0.5)'; // land, temperate forest index 9, alpha 127 → surface 1
  ctx.fillRect(0, 0, 2, 2);
  return c;
}

/** Installs the procedural near-field ground material on the globe. */
export function installGroundMaterial(viewer: Viewer): GroundMaterialHandle {
  // Cesium deep-clones the fabric (Material.initializeMaterial → clone), and cloning a canvas calls
  // `new HTMLCanvasElement()`, which throws "Illegal constructor". Image uniforms therefore start as the default
  // image id (a string, which still yields a sampler2D) and the canvases are assigned immediately afterwards.
  const material = new Material({
    fabric: {
      type: 'TerraGround',
      uniforms: {
        biomeMap: Material.DefaultImageId,
        palette: Material.DefaultImageId,
        fadeNear: 2500,
        fadeFar: 25000,
        wetness: 0,
        snowCover: 0,
        detailStrength: 1,
        seasonTint: 0,
        timeSec: 0,
        cloudCover: 0,
      },
      source: GROUND_GLSL,
    },
    translucent: true,
  });
  material.uniforms.biomeMap = blankBiomeTexture();
  material.uniforms.palette = buildPalette();
  viewer.scene.globe.material = material;
  const start = performance.now();
  const remove = viewer.scene.preUpdate.addEventListener(() => {
    material.uniforms.timeSec = ((performance.now() - start) / 1000) % 3600;
  });
  return {
    material,
    setUniform: (name, value) => { material.uniforms[name] = value; },
    setWorldMap: (map) => { material.uniforms.biomeMap = map.toTexture(); },
    destroy: () => { remove(); viewer.scene.globe.material = undefined; },
  };
}
