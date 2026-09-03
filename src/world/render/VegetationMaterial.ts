/**
 * Cesium rendering layer for near-field meshes: converts MeshData into a Cesium Geometry (position DOUBLE, normal,
 * st, colour UNSIGNED_BYTE normalised, custom `wind` FLOAT attribute) and provides two shared MaterialAppearances —
 * 'opaque' (trunks, cones, rocks, buildings, fruit; casts and receives shadows) and 'cutout' (leaf, grass, crop and
 * flower cards alpha-tested against the procedural atlas; receives shadows only).
 *
 * Floating origin: builders emit small tile-local floats; the GeometryInstance carries the tile's ENU modelMatrix so
 * Cesium bakes world coordinates in double precision on the CPU and splits them into high/low floats for the GPU
 * (relative-to-eye rendering). Primitives use `asynchronous: false` because raw Geometry objects cannot go through
 * Cesium's worker pipeline (it requires a `_workerName`); chunks stay ≤ 65 535 vertices so each synchronous build is
 * a few milliseconds.
 *
 * Wind: the vertex shader sways vertices along a world-space east/north direction (rotated into eye space with
 * czm_viewRotation) so the effect is camera-independent and identical in the shadow pass. The sway phase is taken
 * from `czm_computePosition() + czm_encodedCameraPositionMCLow`, which equals the model-space vertex position
 * modulo 65 536 m exactly in float precision (the high part of the encoded camera position is always a multiple of
 * 65 536), with sine frequencies chosen as 2π·k/65536 so the wrap is seamless.
 *
 * Shadows: Cesium's shadow-cast pass ignores fragment discards for opaque-pass commands, so alpha-cut cards would
 * cast solid quads; the cutout bucket therefore only receives shadows while broadleaf crowns get a small opaque
 * inner core that casts a crown shadow.
 */
import { BoundingSphere, Cartesian2, ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes, GeometryInstance, Material, MaterialAppearance, Matrix4, Primitive, PrimitiveType, ShadowMode } from 'cesium';
import type { MeshData } from './geometry/mesh';

const TWO_PI_OVER_WRAP = (2 * Math.PI) / 65536;
const freq = (k: number): string => (k * TWO_PI_OVER_WRAP).toFixed(8);

/** Vertex shader shared by both buckets (see module doc for the wind model). */
export const VEGETATION_VERTEX_SHADER = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in vec4 color;
in float wind;
in float batchId;

uniform float terraWindTime;
uniform float terraWindStrength;
uniform vec2 terraWindDir;

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec2 v_st;
out vec4 v_color;

const vec3 TERRA_PHASE_A = vec3(${freq(3651)}, ${freq(2190)}, 0.0);
const vec3 TERRA_PHASE_B = vec3(0.0, ${freq(5250)}, ${freq(7302)});

void main()
{
    vec4 p = czm_computePosition();
    vec3 wrapped = p.xyz + czm_encodedCameraPositionMCLow;
    float phaseA = dot(wrapped, TERRA_PHASE_A);
    float phaseB = dot(wrapped, TERRA_PHASE_B);
    float gust = 0.7 * sin(terraWindTime * 1.7 + phaseA) + 0.3 * sin(terraWindTime * 3.9 + phaseB);
    float sway = wind * terraWindStrength * gust;
    vec3 upWC = normalize(czm_viewerPositionWC);
    vec3 eastWC = abs(upWC.z) > 0.999 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 0.0, 1.0), upWC));
    vec3 northWC = cross(upWC, eastWC);
    vec3 dirEC = czm_viewRotation * (eastWC * terraWindDir.x + northWC * terraWindDir.y);
    vec4 positionEC = czm_modelViewRelativeToEye * p;
    positionEC.xyz += dirEC * sway;
    v_positionEC = positionEC.xyz;
    v_normalEC = czm_normal * normal;
    v_st = st;
    v_color = color;
    gl_Position = czm_projection * positionEC;
}
`;

/**
 * Fragment shader: material lookup (atlas for cutout), alpha test, two-sided Lambert with a translucency term for
 * leaves, sky-weighted ambient, night-time window emission for building facades, and distance fog.
 */
export function vegetationFragmentShader(cutout: boolean): string {
  return /* glsl */ `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec2 v_st;
in vec4 v_color;

float terraHash(vec2 p)
{
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main()
{
    vec3 positionToEyeEC = -v_positionEC;
    vec3 normalEC = normalize(v_normalEC);
    normalEC = faceforward(normalEC, vec3(0.0, 0.0, 1.0), -normalEC);

    czm_materialInput materialInput;
    materialInput.s = v_st.s;
    materialInput.st = v_st;
    materialInput.str = vec3(v_st, 0.0);
    materialInput.normalEC = normalEC;
    materialInput.tangentToEyeMatrix = mat3(1.0);
    materialInput.positionToEyeEC = positionToEyeEC;
    materialInput.height = 0.0;
    materialInput.slope = 0.0;
    materialInput.aspect = 0.0;
    materialInput.waterMask = 0.0;
    czm_material material = czm_getMaterial(materialInput);
${cutout ? '    if (material.alpha < 0.5) { discard; }\n    vec3 base = v_color.rgb * material.diffuse;' : '    vec3 base = v_color.rgb;'}

    vec3 upEC = czm_viewRotation * normalize(czm_viewerPositionWC);
    float daylight = clamp(dot(upEC, czm_sunDirectionEC) * 4.0 + 0.35, 0.06, 1.0);
    vec3 emission = vec3(0.0);
${cutout ? '' : `    float code = floor(v_color.a * 255.0 + 0.5);
    if (code > 251.5 && code < 254.5 && v_st.x >= 0.0)
    {
        vec2 cell = floor(v_st);
        vec2 f = fract(v_st);
        float rnd = terraHash(cell + code);
        float win = step(0.22, f.x) * (1.0 - step(0.78, f.x)) * step(0.28, f.y) * (1.0 - step(0.80, f.y));
        if (code == 253.0) { win = step(0.06, f.x) * step(0.10, f.y); }
        if (code == 252.0) { win *= step(0.55, rnd); }
        float lit = step(0.72, rnd) * (1.0 - daylight);
        vec3 glass = mix(vec3(0.16, 0.19, 0.24), vec3(0.98, 0.85, 0.55), lit);
        base = mix(base, glass, win);
        emission = glass * lit * win * 0.8;
    }`}

    vec3 lightDir = normalize(czm_lightDirectionEC);
    float ndl = dot(normalEC, lightDir);
    float diffuse = max(ndl, 0.0)${cutout ? ' + max(-ndl, 0.0) * 0.4' : ''};
    float skyTerm = 0.5 + 0.5 * dot(normalEC, upEC);
    vec3 ambient = base * (0.12 + 0.2 * skyTerm) * daylight;
    vec3 color = ambient + base * diffuse * czm_lightColor * 0.9 + emission;

    float dist = length(positionToEyeEC);
    vec3 fogColor = vec3(0.62, 0.70, 0.80) * daylight;
    color = czm_fog(dist, color, fogColor);
    out_FragColor = vec4(color, 1.0);
}
`;
}

const LEAF_MATERIAL_GLSL = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec4 texel = texture(image, materialInput.st);
    material.diffuse = texel.rgb;
    material.alpha = texel.a;
    return material;
}
`;

const SOLID_MATERIAL_GLSL = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.diffuse = vec3(1.0);
    material.alpha = 1.0;
    return material;
}
`;

export interface WindUniforms { terraWindTime: number; terraWindStrength: number; terraWindDir: Cartesian2 }

export interface VegetationAppearances {
  opaque: MaterialAppearance;
  cutout: MaterialAppearance;
  /** Updates the wind uniforms shared by every tile primitive. */
  setWind(timeS: number, strengthM: number, dirX: number, dirY: number): void;
  destroy(): void;
}

let materialCounter = 0;

/**
 * Creates the two shared appearances. `atlas` is the leaf atlas canvas (null falls back to Cesium's white default
 * image, which renders cards as solid quads).
 */
export function createVegetationAppearances(atlas: HTMLCanvasElement | null): VegetationAppearances {
  const uniforms: WindUniforms = { terraWindTime: 0, terraWindStrength: 0.12, terraWindDir: new Cartesian2(1, 0) };
  const id = materialCounter++;
  const leafMaterial = new Material({
    fabric: { type: `TerraLeafAtlas${id}`, uniforms: { image: atlas ?? Material.DefaultImageId }, source: LEAF_MATERIAL_GLSL },
    translucent: false,
  });
  const solidMaterial = new Material({ fabric: { type: `TerraSolid${id}`, source: SOLID_MATERIAL_GLSL }, translucent: false });
  const make = (material: Material, cutout: boolean): MaterialAppearance => {
    const app = new MaterialAppearance({
      material,
      translucent: false,
      closed: false,
      faceForward: true,
      flat: false,
      vertexShaderSource: VEGETATION_VERTEX_SHADER,
      fragmentShaderSource: vegetationFragmentShader(cutout),
    });
    // Appearance-level uniforms are read by Primitive for both shader stages (Cesium keeps them undocumented on
    // MaterialAppearance but honours `appearance.uniforms`).
    (app as MaterialAppearance & { uniforms?: WindUniforms }).uniforms = uniforms;
    return app;
  };
  const opaque = make(solidMaterial, false);
  const cutout = make(leafMaterial, true);
  return {
    opaque,
    cutout,
    setWind: (timeS, strengthM, dirX, dirY) => {
      uniforms.terraWindTime = timeS;
      uniforms.terraWindStrength = strengthM;
      const l = Math.hypot(dirX, dirY) || 1;
      uniforms.terraWindDir.x = dirX / l;
      uniforms.terraWindDir.y = dirY / l;
    },
    destroy: () => {
      leafMaterial.destroy();
      solidMaterial.destroy();
    },
  };
}

/** Converts MeshData into a Cesium Geometry (positions promoted to doubles; bounding sphere from positions). */
export function createMeshGeometry(mesh: MeshData): Geometry {
  const positions = Float64Array.from(mesh.positions);
  const attributes = new GeometryAttributes();
  attributes.position = new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions });
  attributes.normal = new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: mesh.normals });
  attributes.st = new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: mesh.sts });
  attributes.color = new GeometryAttribute({ componentDatatype: ComponentDatatype.UNSIGNED_BYTE, componentsPerAttribute: 4, normalize: true, values: mesh.colors });
  (attributes as unknown as Record<string, GeometryAttribute>).wind = new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 1, values: mesh.wind });
  return new Geometry({ attributes, indices: mesh.indices, primitiveType: PrimitiveType.TRIANGLES, boundingSphere: BoundingSphere.fromVertices(positions) });
}

/** Wraps one mesh chunk in a Primitive anchored by the tile's ENU model matrix. */
export function createTilePrimitive(mesh: MeshData, modelMatrix: Matrix4, appearance: MaterialAppearance, shadows: ShadowMode): Primitive {
  return new Primitive({
    geometryInstances: new GeometryInstance({ geometry: createMeshGeometry(mesh), modelMatrix }),
    appearance,
    asynchronous: false,
    compressVertices: false,
    interleave: false,
    allowPicking: false,
    releaseGeometryInstances: true,
    shadows,
  });
}

/** Shadow modes per bucket (see module doc). */
export const BUCKET_SHADOWS = { opaque: ShadowMode.ENABLED, cutout: ShadowMode.RECEIVE_ONLY } as const;
