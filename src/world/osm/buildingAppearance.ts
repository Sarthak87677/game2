import { Material, MaterialAppearance } from 'cesium';

/**
 * Custom appearance for extruded buildings: per-vertex colour, wall texture coordinates in metres, day-time glass
 * shading and night-time window emission driven by the real sun direction (czm_sunDirectionWC). Window cells are
 * hashed per building seed so the pattern is deterministic.
 */
const VS = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in vec4 color;
in vec3 params;
in float batchId;
out vec3 v_positionEC;
out vec3 v_normalEC;
out vec2 v_st;
out vec4 v_color;
out vec3 v_params;
void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_st = st;
  v_color = color;
  v_params = params;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`;

const FS = /* glsl */ `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec2 v_st;
in vec4 v_color;
in vec3 v_params;
float bhash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract(p.x * p.y); }
void main() {
  vec3 n = normalize(v_normalEC);
  vec3 toEye = normalize(-v_positionEC);
  if (dot(n, toEye) < 0.0) n = -n;
  vec3 posWC = (czm_inverseView * vec4(v_positionEC, 1.0)).xyz;
  vec3 up = normalize(posWC);
  float sunUp = dot(up, czm_sunDirectionWC);
  float night = 1.0 - smoothstep(-0.12, 0.05, sunUp);
  float diffuse = max(dot(n, czm_lightDirectionEC), 0.0);
  float sky = 0.5 + 0.5 * dot(n, czm_normal * vec3(0.0, 0.0, 1.0));
  vec3 base = v_color.rgb;
  float roof = v_params.y;
  float windows = v_params.z;
  float seed = v_params.x;
  vec3 col = base;
  float emissive = 0.0;
  if (roof < 0.5 && windows > 0.01) {
    vec2 cellSize = vec2(3.4, 3.1);
    vec2 cell = floor(v_st / cellSize);
    vec2 f = fract(v_st / cellSize);
    bool inWin = f.x > 0.28 && f.x < 0.74 && f.y > 0.32 && f.y < 0.82 && v_st.y > 0.8;
    float h = bhash(cell + seed * 7.31);
    if (inWin) {
      // Day: glass reflects sky; night: warm light in a subset of rooms.
      vec3 glass = mix(vec3(0.20, 0.27, 0.36), vec3(0.55, 0.65, 0.78), sky);
      col = mix(base * 0.9, glass, 0.85);
      float lit = step(1.0 - windows * 0.55, h) ;
      emissive = lit * night;
    } else {
      col = base * (0.92 + 0.08 * bhash(cell * 0.37 + seed));
    }
    // Floor bands.
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y);
  } else if (roof > 0.5) {
    col = base * (0.95 + 0.1 * bhash(floor(v_st / 2.0) + seed));
  }
  float light = 0.28 + 0.72 * diffuse;
  light = mix(light, 0.12 + 0.1 * sky, night);
  vec3 lit = col * light * (0.85 + 0.15 * sky);
  vec3 warm = vec3(1.0, 0.86, 0.62) * (0.9 + 0.3 * bhash(vec2(seed, roof)));
  vec3 finalColor = lit + warm * emissive * 0.95;
  out_FragColor = vec4(finalColor, 1.0);
}
`;

export function createBuildingAppearance(): MaterialAppearance {
  return new MaterialAppearance({
    material: Material.fromType('Color'),
    vertexShaderSource: VS,
    fragmentShaderSource: FS,
    translucent: false,
    closed: true,
    faceForward: false,
    flat: false,
  });
}
