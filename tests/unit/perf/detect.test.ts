import { describe, expect, it } from 'vitest';
import { detectQualityPreset } from '@/engine/quality';

describe('detectQualityPreset (GPU-aware, smoothness-biased)', () => {
  it('starts a software rasteriser in Performance mode', () => {
    expect(detectQualityPreset({ softwareRenderer: true, cpuCores: 16, deviceMemoryGb: 32 })).toBe('performance');
  });
  it('starts a mid integrated GPU on Low regardless of core count', () => {
    expect(detectQualityPreset({ gpuRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49), Direct3D11)', cpuCores: 16, deviceMemoryGb: 16 })).toBe('low');
    expect(detectQualityPreset({ gpuRenderer: 'ANGLE (Qualcomm, Adreno (TM) 640, OpenGL)', cpuCores: 8, deviceMemoryGb: 8 })).toBe('low');
  });
  it('starts a bottom-tier integrated GPU in Performance mode', () => {
    expect(detectQualityPreset({ gpuRenderer: 'Intel(R) UHD Graphics 620', cpuCores: 8, deviceMemoryGb: 8 })).toBe('performance');
  });
  it('lets a discrete GPU with plenty of cores start High', () => {
    expect(detectQualityPreset({ gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, Direct3D11)', cpuCores: 12, deviceMemoryGb: 16 })).toBe('high');
    expect(detectQualityPreset({ gpuRenderer: 'Apple M2', cpuCores: 8, deviceMemoryGb: 16 })).toBe('high');
  });
  it('a modest discrete/unknown machine starts Medium', () => {
    expect(detectQualityPreset({ gpuRenderer: 'ANGLE (AMD, Radeon RX 560, Direct3D11)', cpuCores: 4, deviceMemoryGb: 8 })).toBe('medium');
  });
  it('a tiny machine starts Low', () => {
    expect(detectQualityPreset({ gpuRenderer: 'unknown', cpuCores: 2, deviceMemoryGb: 2 })).toBe('low');
  });
});

describe('detectQualityPreset — AMD integrated (Ryzen APU) and discrete are told apart', () => {
  const R = (s: string) => detectQualityPreset({ gpuRenderer: s, cpuCores: 8, deviceMemoryGb: 16 });
  it('starts the weakest APU graphics in Performance mode', () => {
    // The exact string Chrome reports on an ASUS Vivobook S16 (Ryzen AI 5 330 / Radeon 820M).
    expect(R('ANGLE (AMD, AMD Radeon(TM) 820M Graphics (0x000015BF), Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('performance');
    expect(R('ANGLE (AMD, AMD Radeon(TM) 610M Graphics, Direct3D11)')).toBe('performance');
    expect(R('ANGLE (Intel, Intel(R) UHD Graphics 620, Direct3D11)')).toBe('performance');
    expect(R('ANGLE (AMD, AMD Radeon(TM) Vega 3 Graphics, Direct3D11)')).toBe('performance');
  });
  it('starts a stronger APU on Low, not Performance', () => {
    expect(R('ANGLE (AMD, AMD Radeon(TM) 780M Graphics, Direct3D11)')).toBe('low');
    expect(R('ANGLE (AMD, AMD Radeon(TM) Graphics, Direct3D11)')).toBe('low');
    expect(R('ANGLE (Intel, Intel(R) Arc(TM) Graphics, Direct3D11)')).toBe('low');
  });
  it('never mistakes a discrete card for integrated', () => {
    expect(R('ANGLE (AMD, AMD Radeon RX 6700 XT, Direct3D11)')).toBe('high');
    expect(R('ANGLE (AMD, Radeon RX 7900 XTX, Vulkan)')).toBe('high');
    expect(R('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics, Direct3D11)')).toBe('high');
    expect(R('ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU, Direct3D11)')).toBe('high');
  });
});
