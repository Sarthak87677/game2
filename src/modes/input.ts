/** Unified input state from keyboard, mouse (pointer lock or drag), touch joysticks and gamepads. */
export interface InputFrame {
  /** -1..1 strafe (right positive). */
  moveX: number;
  /** -1..1 forward positive. */
  moveY: number;
  /** -1..1 vertical (up positive). */
  moveZ: number;
  /** Look deltas in pixels-equivalent units for this frame. */
  lookDx: number;
  lookDy: number;
  sprint: boolean;
  jump: boolean;
  brake: boolean;
  /** Raw pressed keys. */
  keys: Set<string>;
}

export interface InputManagerOptions {
  element: HTMLElement;
  /** Called on key presses that are commands (mode switching etc.). */
  onCommand?: (command: string) => void;
}

export class InputManager {
  readonly keys = new Set<string>();
  private lookDx = 0;
  private lookDy = 0;
  private dragging = false;
  private lastPointer: { x: number; y: number } | null = null;
  private virtualAxis = { x: 0, y: 0 };
  private virtualLook = { dx: 0, dy: 0 };
  private jumpQueued = false;
  private element: HTMLElement;
  private onCommand?: (c: string) => void;
  pointerLockWanted = false;
  private disposers: (() => void)[] = [];

  constructor(opts: InputManagerOptions) {
    this.element = opts.element;
    this.onCommand = opts.onCommand;
    const el = this.element;
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Document | Window, type: K | string, fn: (e: never) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type as string, fn as EventListener, options);
      this.disposers.push(() => target.removeEventListener(type as string, fn as EventListener, options));
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (!e.repeat) this.onCommand?.(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
    on(el, 'mousedown', (e: MouseEvent) => {
      if (e.button === 2 || (e.button === 0 && this.pointerLockWanted)) {
        this.dragging = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        if (this.pointerLockWanted && document.pointerLockElement !== el) el.requestPointerLock?.();
      }
    });
    on(window, 'mouseup', () => { this.dragging = false; this.lastPointer = null; });
    on(window, 'mousemove', (e: MouseEvent) => {
      if (document.pointerLockElement === el) { this.lookDx += e.movementX; this.lookDy += e.movementY; return; }
      if (this.dragging && this.lastPointer) {
        this.lookDx += e.clientX - this.lastPointer.x;
        this.lookDy += e.clientY - this.lastPointer.y;
        this.lastPointer = { x: e.clientX, y: e.clientY };
      }
    });
    on(el, 'contextmenu', (e: Event) => { if (this.pointerLockWanted) e.preventDefault(); });
    on(document, 'pointerlockchange', () => { if (document.pointerLockElement !== el) this.dragging = false; });
  }

  /** Touch joysticks feed movement (x right, y forward) in -1..1 and look deltas in px. */
  setVirtualAxis(x: number, y: number): void { this.virtualAxis = { x, y }; }
  addVirtualLook(dx: number, dy: number): void { this.virtualLook.dx += dx; this.virtualLook.dy += dy; }
  queueJump(): void { this.jumpQueued = true; }

  releasePointerLock(): void {
    if (document.pointerLockElement === this.element) document.exitPointerLock?.();
  }

  private readGamepad(): { x: number; y: number; z: number; lx: number; ly: number; sprint: boolean; jump: boolean } | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
      const x = dz(gp.axes[0] ?? 0);
      const y = -dz(gp.axes[1] ?? 0);
      const lx = dz(gp.axes[2] ?? 0);
      const ly = dz(gp.axes[3] ?? 0);
      const up = gp.buttons[7]?.value ?? 0;
      const down = gp.buttons[6]?.value ?? 0;
      return { x, y, z: up - down, lx: lx * 12, ly: ly * 12, sprint: !!gp.buttons[10]?.pressed, jump: !!gp.buttons[0]?.pressed };
    }
    return null;
  }

  /** Consume the per-frame input state. */
  poll(): InputFrame {
    const k = this.keys;
    let moveX = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let moveY = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let moveZ = (k.has('KeyE') || k.has('PageUp') ? 1 : 0) - (k.has('KeyQ') || k.has('KeyC') || k.has('PageDown') ? 1 : 0);
    if (k.has('Space')) moveZ += 1;
    if (k.has('ControlLeft') || k.has('ControlRight')) moveZ -= 1;
    moveX += this.virtualAxis.x;
    moveY += this.virtualAxis.y;
    let lookDx = this.lookDx + this.virtualLook.dx;
    let lookDy = this.lookDy + this.virtualLook.dy;
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    let jump = this.jumpQueued;
    const gp = this.readGamepad();
    if (gp) { moveX += gp.x; moveY += gp.y; moveZ += gp.z; lookDx += gp.lx; lookDy += gp.ly; sprint = sprint || gp.sprint; jump = jump || gp.jump; }
    this.lookDx = 0; this.lookDy = 0; this.virtualLook = { dx: 0, dy: 0 }; this.jumpQueued = false;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return { moveX: clamp(moveX), moveY: clamp(moveY), moveZ: clamp(moveZ), lookDx, lookDy, sprint, jump, brake: k.has('Space') || k.has('KeyX'), keys: k };
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.releasePointerLock();
  }
}
