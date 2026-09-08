import { describe, expect, it } from 'vitest';
import { FrameWindow, frameStatsOf, percentileSorted } from '@/perf/frameStats';

describe('percentileSorted', () => {
  it('uses nearest-rank and clamps', () => {
    const s = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(percentileSorted(s, 10, 0.5)).toBe(6);
    expect(percentileSorted(s, 10, 0.49)).toBe(5);
    expect(percentileSorted(s, 10, 0.99)).toBe(10);
    expect(percentileSorted(s, 10, 1)).toBe(10);
    expect(percentileSorted(s, 10, 0)).toBe(1);
    expect(percentileSorted(s, 0, 0.99)).toBe(0);
  });
  it('p99 of 100 frames with one spike picks the spike', () => {
    const list = Array.from({ length: 99 }, () => 16.7).concat([200]);
    const st = frameStatsOf(list);
    expect(st.p99Ms).toBe(200);
    expect(st.onePercentLowFps).toBeCloseTo(5, 3);
    expect(st.frameMs).toBeCloseTo((99 * 16.7 + 200) / 100, 6);
    expect(st.avgFps).toBeCloseTo(100_000 / (99 * 16.7 + 200), 6);
    expect(st.frames).toBe(100);
  });
  it('handles empty input', () => {
    expect(frameStatsOf([]).frames).toBe(0);
    expect(frameStatsOf([]).currentFps).toBe(0);
  });
});

describe('FrameWindow', () => {
  it('reports steady 60 fps', () => {
    const w = new FrameWindow(512, 10_000);
    let t = 0;
    for (let i = 0; i < 300; i++) { t += 1000 / 60; w.push(1000 / 60, t); }
    const st = w.stats(t);
    expect(st.frames).toBe(300);
    expect(st.currentFps).toBeCloseTo(60, 3);
    expect(st.avgFps).toBeCloseTo(60, 1);
    expect(st.onePercentLowFps).toBeCloseTo(60, 3);
    expect(st.p99Ms).toBeCloseTo(1000 / 60, 6);
  });
  it('drops frames older than the window and keeps the newest in the ring', () => {
    const w = new FrameWindow(64, 1000);
    let t = 0;
    for (let i = 0; i < 200; i++) { t += 50; w.push(50, t); }
    const st = w.stats(t);
    expect(st.frames).toBeLessThanOrEqual(21);
    expect(st.frames).toBeGreaterThanOrEqual(19);
    expect(st.currentFps).toBeCloseTo(20, 3);
  });
  it('current fps falls back to the last frame time when fewer than two frames landed in the last second', () => {
    const w = new FrameWindow(64, 10_000);
    w.push(2000, 2000);
    w.push(2500, 4500);
    const st = w.stats(4500);
    expect(st.currentFps).toBeCloseTo(0.4, 6);
    // Two frames covered 4.5 s of wall time (the first started at t = 0).
    expect(st.avgFps).toBeCloseTo(2000 / 4500, 6);
  });
  it('1 % low reflects a stutter within the window', () => {
    const w = new FrameWindow(1024, 10_000);
    let t = 0;
    // 6 of 500 frames (1.2 %) stutter: p99 lands on a stutter frame; a single spike (0.2 %) would not.
    for (let i = 0; i < 500; i++) { const d = i % 80 === 0 ? 120 : 10; t += d; w.push(d, t); }
    const st = w.stats(t);
    expect(st.p99Ms).toBe(120);
    expect(st.onePercentLowFps).toBeCloseTo(1000 / 120, 6);
    expect(st.currentFps).toBeGreaterThan(80);
  });
  it('ignores non-positive or non-finite frame times and clears', () => {
    const w = new FrameWindow(8, 1000);
    w.push(0, 1); w.push(-5, 2); w.push(NaN, 3); w.push(Infinity, 4);
    expect(w.length).toBe(0);
    w.push(10, 10);
    expect(w.length).toBe(1);
    w.clear();
    expect(w.stats(10).frames).toBe(0);
  });
});
