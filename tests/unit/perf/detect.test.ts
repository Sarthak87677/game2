import { describe, expect, it } from 'vitest';
import { detectQualityPreset } from '@/engine/quality';

describe('detectQualityPreset (GPU-aware, smoothness-biased)', () => {
  it('starts a software rasteriser in Performance mode', () => {
    expect(detectQualityPreset({ softwareRenderer: true, cpuCores: 16, deviceMemoryGb: 32 })).toBe('performance');
  });
  it('starts an integrated GPU on Low regardless of core count', () => {
    expect(detectQualityPreset({ gpuRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49), Direct3D11)', cpuCores: 16, deviceMemoryGb: 16 })).toBe('low');
    expect(detectQualityPreset({ gpuRenderer: 'ANGLE (Qualcomm, Adreno (TM) 640, OpenGL)', cpuCores: 8, deviceMemoryGb: 8 })).toBe('low');
    expect(detectQualityPreset({ gpuRenderer: 'Intel(R) UHD Graphics 620', cpuCores: 8, deviceMemoryGb: 8 })).toBe('low');
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
