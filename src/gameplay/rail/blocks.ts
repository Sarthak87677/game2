/**
 * Simple block signalling: the corridor is divided into blocks at station boundaries (long blocks are split every
 * `maxBlockM`). A train may enter the next block only when no other train travelling the same way occupies it —
 * otherwise it is held at the boundary signal. Pure TypeScript (unit-tested).
 */
export class BlockSystem {
  readonly boundaries: number[];
  private readonly occupancy = new Map<string, { block: number; direction: 1 | -1 }>();

  constructor(stationS: number[], lengthM: number, maxBlockM = 6000) {
    const b = new Set<number>([0, lengthM]);
    const sorted = [...stationS].sort((x, y) => x - y);
    for (const s of sorted) b.add(s);
    const base = [...b].sort((x, y) => x - y);
    const out: number[] = [];
    for (let i = 0; i < base.length; i++) {
      out.push(base[i]);
      if (i < base.length - 1) {
        const gap = base[i + 1] - base[i];
        const n = Math.floor(gap / maxBlockM);
        for (let k = 1; k <= n; k++) { const s = base[i] + (gap * k) / (n + 1); out.push(s); }
      }
    }
    this.boundaries = out;
  }

  blockOf(s: number): number {
    const b = this.boundaries;
    if (s <= b[0]) return 0;
    for (let i = 1; i < b.length; i++) if (s < b[i]) return i - 1;
    return Math.max(0, b.length - 2);
  }

  /** Arc length of the next boundary ahead of s in the direction, or null at the end of the line. */
  nextBoundary(s: number, direction: 1 | -1): number | null {
    const b = this.boundaries;
    if (direction > 0) { for (let i = 0; i < b.length; i++) if (b[i] > s + 0.01) return b[i]; return null; }
    for (let i = b.length - 1; i >= 0; i--) if (b[i] < s - 0.01) return b[i];
    return null;
  }

  update(trainId: string, s: number, direction: 1 | -1): void {
    this.occupancy.set(trainId, { block: this.blockOf(s), direction });
  }

  remove(trainId: string): void { this.occupancy.delete(trainId); }

  /** True when `trainId` may enter `block` (no other train heading the same way is in it). */
  canEnter(trainId: string, block: number, direction: 1 | -1): boolean {
    for (const [id, o] of this.occupancy) if (id !== trainId && o.block === block && o.direction === direction) return false;
    return true;
  }

  /** Block index the train would enter by crossing the next boundary. */
  blockBeyond(s: number, direction: 1 | -1): number | null {
    const nb = this.nextBoundary(s, direction);
    if (nb === null) return null;
    return this.blockOf(nb + (direction > 0 ? 0.5 : -0.5));
  }

  occupied(): number { return this.occupancy.size; }
}
