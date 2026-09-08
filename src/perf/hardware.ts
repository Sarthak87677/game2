/**
 * Hardware and graphics-stack detection for the Diagnostics panel, the copied report and performance records.
 * Everything here is what the browser is willing to expose; VRAM is not (WebGL has no query for it).
 */

export interface HardwareInfo {
  cpuCores: number | null;
  /** `navigator.deviceMemory` (GiB, Chromium only, coarse buckets) or null. */
  deviceMemoryGb: number | null;
  gpuVendor: string;
  gpuRenderer: string;
  /** e.g. "WebGL2 via ANGLE (Vulkan)" or "WebGL2 (native)". */
  graphicsApi: string;
  /** ANGLE backend parsed from the renderer string (D3D11, Vulkan, Metal, OpenGL, SwiftShader…) or null. */
  angleBackend: string | null;
  /** True when the renderer string names a software rasteriser (SwiftShader, llvmpipe, Microsoft Basic Render…). */
  softwareRenderer: boolean;
  maxTextureSize: number | null;
  screen: { width: number; height: number; devicePixelRatio: number };
  vram: string;
  userAgent: string;
  platform: string;
}

export const VRAM_NOT_EXPOSED = 'not exposed by WebGL';

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|mesa offscreen|lavapipe/i;

/** Parses the ANGLE renderer string into vendor / device / backend. Non-ANGLE strings pass through. */
export function parseRendererString(renderer: string): { vendor: string | null; device: string; backend: string | null; angle: boolean } {
  const m = /^ANGLE \((.*)\)$/s.exec(renderer.trim());
  if (!m) return { vendor: null, device: renderer, backend: null, angle: false };
  const inner = m[1];
  // "Vendor, Device…, Backend" — the device part can itself contain commas and parentheses.
  const first = inner.indexOf(', ');
  const last = inner.lastIndexOf(', ');
  let vendor: string | null = null;
  let device = inner;
  let backend: string | null = null;
  if (first > 0) { vendor = inner.slice(0, first); device = inner.slice(first + 2); }
  if (last > first && last > 0) { backend = inner.slice(last + 2); device = inner.slice(first + 2, last); }
  if (/swiftshader/i.test(inner)) backend = 'SwiftShader (Vulkan software rasteriser)';
  else if (backend) {
    if (/^d3d11/i.test(backend) || /direct3d11/i.test(device)) backend = 'D3D11';
    else if (/^d3d9/i.test(backend) || /direct3d9/i.test(device)) backend = 'D3D9';
    else if (/vulkan/i.test(backend) || /vulkan/i.test(device)) backend = 'Vulkan';
    else if (/metal/i.test(backend) || /metal/i.test(device)) backend = 'Metal';
    else if (/opengl es/i.test(backend)) backend = 'OpenGL ES';
    else if (/opengl/i.test(backend)) backend = 'OpenGL';
    else if (/unspecified version/i.test(backend)) backend = /metal/i.test(device) ? 'Metal' : null;
  } else if (/metal/i.test(device)) backend = 'Metal';
  else if (/vulkan/i.test(device)) backend = 'Vulkan';
  return { vendor, device: device.trim(), backend, angle: true };
}

export function isSoftwareRenderer(renderer: string): boolean { return SOFTWARE.test(renderer); }

/** Reads WebGL2 capabilities from a context (or a throw-away canvas when none is given). */
export function detectHardware(gl?: WebGL2RenderingContext | WebGLRenderingContext | null): HardwareInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  let ctx: WebGL2RenderingContext | WebGLRenderingContext | null = gl ?? null;
  let ownCanvas = false;
  if (!ctx && typeof document !== 'undefined') {
    try { ctx = document.createElement('canvas').getContext('webgl2'); ownCanvas = true; } catch { ctx = null; }
  }
  let vendor = 'unknown', renderer = 'unknown', maxTextureSize: number | null = null, webgl2 = false;
  if (ctx) {
    try {
      webgl2 = typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext;
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number } | null;
      if (dbg) {
        vendor = String(ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? 'unknown');
        renderer = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? 'unknown');
      } else {
        vendor = String(ctx.getParameter(ctx.VENDOR) ?? 'unknown');
        renderer = String(ctx.getParameter(ctx.RENDERER) ?? 'unknown');
      }
      const mts = ctx.getParameter(ctx.MAX_TEXTURE_SIZE);
      maxTextureSize = typeof mts === 'number' ? mts : null;
    } catch { /* keep unknowns */ }
    if (ownCanvas) { try { ctx.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ } }
  }
  const parsed = parseRendererString(renderer);
  const api = ctx ? (webgl2 ? 'WebGL2' : 'WebGL1') : 'no WebGL';
  const graphicsApi = parsed.angle ? `${api} via ANGLE${parsed.backend ? ` (${parsed.backend})` : ''}` : ctx ? `${api} (native driver)` : api;
  const screenInfo = typeof screen !== 'undefined' ? { width: screen.width, height: screen.height, devicePixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1 } : { width: 0, height: 0, devicePixelRatio: 1 };
  return {
    cpuCores: nav?.hardwareConcurrency ?? null,
    deviceMemoryGb: (nav as (Navigator & { deviceMemory?: number }) | null)?.deviceMemory ?? null,
    gpuVendor: parsed.vendor ?? vendor,
    gpuRenderer: renderer,
    graphicsApi,
    angleBackend: parsed.backend,
    softwareRenderer: isSoftwareRenderer(renderer),
    maxTextureSize,
    screen: screenInfo,
    vram: VRAM_NOT_EXPOSED,
    userAgent: nav?.userAgent ?? 'unknown',
    platform: (nav as (Navigator & { userAgentData?: { platform?: string } }) | null)?.userAgentData?.platform ?? nav?.platform ?? 'unknown',
  };
}

/** Short one-line summary for logs and tables. */
export function describeHardware(h: HardwareInfo): string {
  return `${h.cpuCores ?? '?'} cores · ${h.deviceMemoryGb !== null ? `${h.deviceMemoryGb} GB` : 'memory n/a'} · ${h.gpuRenderer} · ${h.graphicsApi} · ${h.screen.width}×${h.screen.height} @${h.screen.devicePixelRatio}× · VRAM ${h.vram}${h.softwareRenderer ? ' · SOFTWARE RENDERER (not a GPU)' : ''}`;
}
