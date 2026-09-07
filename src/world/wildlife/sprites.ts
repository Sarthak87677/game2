/**
 * Procedural animal sprites (canvas): cattle, dogs, birds (crow, pigeon, gull, egret, generic) and butterflies.
 * Abstract silhouettes with regional colouring; two frames for flying things. No photographs or copied art.
 */
export type AnimalKind = 'cattle' | 'dog' | 'crow' | 'pigeon' | 'gull' | 'egret' | 'bird' | 'butterfly';

export interface AnimalSprite { ids: string[]; canvases: HTMLCanvasElement[]; widthM: number; heightM: number }

export const ANIMAL_LABEL: Record<AnimalKind, string> = { cattle: 'Cattle', dog: 'Street dog', crow: 'House crow', pigeon: 'Pigeon', gull: 'Gull', egret: 'Egret', bird: 'Small bird', butterfly: 'Butterfly' };

const CATTLE = [['#f4efe6', '#d8cfc0'], ['#8d6e63', '#6d4c41'], ['#f4efe6', '#4e342e'], ['#3e2723', '#2b1a14'], ['#e0d6c6', '#b89b7a']];
const DOG = [['#c8a165', '#8d6e46'], ['#f2ede4', '#c9c2b4'], ['#4e342e', '#2e1e18'], ['#a1887f', '#6d4c41']];
const BUTTERFLY = [['#ff9800', '#3e2723'], ['#ffeb3b', '#5d4037'], ['#e1f5fe', '#37474f'], ['#ce93d8', '#4a148c'], ['#ef5350', '#1a1a1a']];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function drawCattle(variant: number, frame: number): HTMLCanvasElement {
  const [c, g] = canvas(48, 32);
  const [body, patch] = CATTLE[variant % CATTLE.length];
  const bob = frame === 1 ? 1 : 0;
  g.fillStyle = body;
  g.beginPath(); g.ellipse(24, 15 + bob, 15, 8, 0, 0, Math.PI * 2); g.fill(); // body
  g.fillStyle = patch;
  g.beginPath(); g.ellipse(18, 13 + bob, 6, 4, 0.3, 0, Math.PI * 2); g.fill(); // patch
  g.fillStyle = body;
  g.fillRect(36, 8 + bob, 8, 9); // head
  g.fillStyle = '#e8d3c0'; g.fillRect(41, 12 + bob, 4, 4); // muzzle
  g.strokeStyle = '#d7c8a8'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(37, 8 + bob); g.lineTo(34, 3 + bob); g.moveTo(43, 8 + bob); g.lineTo(46, 3 + bob); g.stroke(); // horns
  g.fillStyle = patch;
  for (const x of [13, 19, 29, 34]) g.fillRect(x + (frame === 1 && (x === 13 || x === 29) ? 1 : 0), 21, 3, 10); // legs
  g.strokeStyle = patch; g.lineWidth = 1; g.beginPath(); g.moveTo(9, 13 + bob); g.lineTo(6, 24 + bob); g.stroke(); // tail
  return c;
}

function drawDog(variant: number, frame: number): HTMLCanvasElement {
  const [c, g] = canvas(32, 20);
  const [body, dark] = DOG[variant % DOG.length];
  const bob = frame === 1 ? 1 : 0;
  g.fillStyle = body;
  g.beginPath(); g.ellipse(15, 10 + bob, 9, 4.5, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(23, 5 + bob, 6, 6); // head
  g.fillStyle = dark; g.fillRect(27, 8 + bob, 3, 2); g.fillRect(23, 3 + bob, 2, 3); // nose, ear
  for (const x of [8, 12, 18, 22]) g.fillRect(x + (frame === 1 && (x === 8 || x === 18) ? 1 : 0), 13, 2, 6);
  g.strokeStyle = dark; g.lineWidth = 1.5; g.beginPath(); g.moveTo(6, 9 + bob); g.lineTo(2, 4 + bob); g.stroke(); // tail up
  return c;
}

function drawBird(kind: AnimalKind, frame: number): HTMLCanvasElement {
  const [c, g] = canvas(20, 16);
  const colour = kind === 'crow' ? '#1a1a1a' : kind === 'pigeon' ? '#78909c' : kind === 'gull' || kind === 'egret' ? '#f5f5f5' : '#5d4037';
  const wingY = frame === 0 ? 3 : 9;
  g.strokeStyle = colour; g.lineWidth = kind === 'egret' ? 2.5 : 2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(1, wingY); g.lineTo(10, 8); g.lineTo(19, wingY); g.stroke();
  g.fillStyle = colour; g.beginPath(); g.ellipse(10, 8, kind === 'egret' ? 4 : 3, 2, 0, 0, Math.PI * 2); g.fill();
  if (kind === 'egret') { g.strokeStyle = colour; g.lineWidth = 1; g.beginPath(); g.moveTo(13, 8); g.lineTo(17, 6); g.stroke(); g.fillStyle = '#f9a825'; g.fillRect(16, 5, 3, 1.5); }
  if (kind === 'gull') { g.fillStyle = '#9e9e9e'; g.fillRect(2, wingY - 1, 4, 2); g.fillRect(14, wingY - 1, 4, 2); }
  return c;
}

function drawButterfly(variant: number, frame: number): HTMLCanvasElement {
  const [c, g] = canvas(14, 12);
  const [wing, body] = BUTTERFLY[variant % BUTTERFLY.length];
  const spread = frame === 0 ? 6 : 2.5;
  g.fillStyle = wing;
  g.beginPath(); g.ellipse(7 - spread / 2, 5, spread, 4, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(7 + spread / 2, 5, spread, 4, 0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = body; g.fillRect(6.2, 2, 1.6, 8);
  return c;
}

export class AnimalSprites {
  private cache = new Map<string, AnimalSprite>();

  get(kind: AnimalKind, variant = 0): AnimalSprite | null {
    if (typeof document === 'undefined') return null;
    const key = `${kind}:${variant}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    let canvases: HTMLCanvasElement[];
    let widthM: number, heightM: number;
    switch (kind) {
      case 'cattle': canvases = [drawCattle(variant, 0), drawCattle(variant, 1)]; widthM = 2.4; heightM = 1.6; break;
      case 'dog': canvases = [drawDog(variant, 0), drawDog(variant, 1)]; widthM = 1.0; heightM = 0.62; break;
      case 'butterfly': canvases = [drawButterfly(variant, 0), drawButterfly(variant, 1)]; widthM = 0.16; heightM = 0.14; break;
      default: canvases = [drawBird(kind, 0), drawBird(kind, 1)]; widthM = kind === 'egret' ? 1.0 : kind === 'gull' ? 0.9 : kind === 'pigeon' ? 0.5 : kind === 'crow' ? 0.7 : 0.35; heightM = widthM * 0.8;
    }
    const sprite = { ids: canvases.map((_, i) => `animal:${key}:${i}`), canvases, widthM, heightM };
    this.cache.set(key, sprite);
    return sprite;
  }

  get size(): number { return this.cache.size; }
}
