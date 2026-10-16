import { settings } from './settings.js';

// Keyboard and mouse, turned into simulation commands (see emptyCommand in src/sim/player.js).
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { left: false, right: false, dx: 0, dy: 0, wheel: 0 };
    this.pressed = new Set(); // keys pressed this frame
    this.locked = false;
    this.canvas = canvas;
    // view angles are owned by the client so mouse look never waits for the simulation
    this.yaw = 0;
    this.pitch = 0;

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.locked && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.keys.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
    // some browsers reject unadjustedMovement: retry without it
    if (p?.catch) p.catch(() => this.canvas.requestPointerLock());
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  wasPressed(code) { return this.pressed.has(code); }

  resetLook() { this.yaw = 0; this.pitch = 0; }

  // part of the weapon recoil is permanent: the simulation reports it and the view keeps it
  addPitch(p) { this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + p)); }

  // sensitivityScale: lower while aiming down sights; cardMode: digit keys pick an upgrade card
  buildCommand(sensitivityScale, cardMode = false) {
    const sens = 0.0022 * sensitivityScale * settings.sensitivity;
    this.yaw -= this.mouse.dx * sens;
    this.pitch -= this.mouse.dy * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    let moveX = 0, moveZ = 0;
    if (this.down('KeyW', 'ArrowUp')) moveZ -= 1;
    if (this.down('KeyS', 'ArrowDown')) moveZ += 1;
    if (this.down('KeyA', 'ArrowLeft')) moveX -= 1;
    if (this.down('KeyD', 'ArrowRight')) moveX += 1;

    let slot = null;
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((code, i) => { if (this.wasPressed(code)) slot = i; });

    const pickCard = cardMode ? slot : null;
    if (cardMode) slot = null;

    return {
      moveX, moveZ,
      pickCard,
      sprint: this.down('ShiftLeft', 'ShiftRight'),
      jump: this.wasPressed('Space'),
      fire: this.mouse.left,
      aim: this.mouse.right,
      reload: this.wasPressed('KeyR'),
      use: this.down('KeyE'),
      slot,
      cycle: Math.sign(this.mouse.wheel),
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
  }
}
