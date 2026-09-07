import { describe, expect, it } from 'vitest';
import { describeHardware, detectHardware, isSoftwareRenderer, parseRendererString, VRAM_NOT_EXPOSED } from '@/perf/hardware';

describe('parseRendererString', () => {
  it('parses SwiftShader (Vulkan software rasteriser)', () => {
    const r = parseRendererString('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)');
    expect(r.angle).toBe(true);
    expect(r.vendor).toBe('Google');
    expect(r.backend).toMatch(/SwiftShader/);
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
  });
  it('parses D3D11, Metal, OpenGL and Vulkan backends', () => {
    expect(parseRendererString('ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toMatchObject({ vendor: 'NVIDIA', backend: 'D3D11', device: 'NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0' });
    expect(parseRendererString('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)')).toMatchObject({ vendor: 'Apple', backend: 'Metal' });
    expect(parseRendererString('ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)')).toMatchObject({ vendor: 'Intel', backend: 'OpenGL', device: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)' });
    expect(parseRendererString('ANGLE (AMD, AMD Radeon RX 6800 (RADV NAVI21), Vulkan 1.3.255)')).toMatchObject({ vendor: 'AMD', backend: 'Vulkan' });
    expect(parseRendererString('ANGLE (Qualcomm, Adreno (TM) 650, OpenGL ES 3.2 V@0502.0)')).toMatchObject({ backend: 'OpenGL ES' });
  });
  it('passes native (non-ANGLE) strings through', () => {
    const r = parseRendererString('Mesa Intel(R) Xe Graphics (TGL GT2)');
    expect(r.angle).toBe(false);
    expect(r.backend).toBeNull();
    expect(r.device).toBe('Mesa Intel(R) Xe Graphics (TGL GT2)');
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('Mesa Intel(R) Xe Graphics (TGL GT2)')).toBe(false);
  });
});

describe('detectHardware', () => {
  it('records what the browser exposes and states that VRAM is not', () => {
    const fake = {
      getExtension: (name: string) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 } : null),
      getParameter: (p: number) => (p === 1 ? 'Google Inc. (Google)' : p === 2 ? 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)' : 8192),
      MAX_TEXTURE_SIZE: 3, VENDOR: 4, RENDERER: 5,
    } as unknown as WebGL2RenderingContext;
    const h = detectHardware(fake);
    expect(h.gpuVendor).toBe('Google');
    expect(h.gpuRenderer).toMatch(/SwiftShader/);
    expect(h.softwareRenderer).toBe(true);
    expect(h.maxTextureSize).toBe(8192);
    expect(h.vram).toBe(VRAM_NOT_EXPOSED);
    expect(h.graphicsApi).toMatch(/via ANGLE \(SwiftShader/);
    expect(typeof h.cpuCores === 'number' || h.cpuCores === null).toBe(true);
    expect(h.screen.devicePixelRatio).toBeGreaterThan(0);
    const line = describeHardware(h);
    expect(line).toMatch(/SOFTWARE RENDERER/);
    expect(line).toMatch(/VRAM not exposed by WebGL/);
  });
  it('survives a context without the debug extension', () => {
    const fake = { getExtension: () => null, getParameter: (p: number) => (p === 3 ? 4096 : 'WebKit'), MAX_TEXTURE_SIZE: 3, VENDOR: 4, RENDERER: 5 } as unknown as WebGL2RenderingContext;
    const h = detectHardware(fake);
    expect(h.gpuRenderer).toBe('WebKit');
    expect(h.maxTextureSize).toBe(4096);
    expect(h.softwareRenderer).toBe(false);
  });
});
