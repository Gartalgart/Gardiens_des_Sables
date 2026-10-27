import { settings } from './settings.js';

// Keyboard and mouse, or the touch controls (src/touch.js), turned into simulation commands (see
// emptyCommand in src/sim/player.js).
export class Input {
  constructor(canvas) {
    this.touch = null; // the TouchControls on a phone or a tablet
    this.lookScale = 1; // the aim assist slows the view down over an enemy (touch only)
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
      if (!this.locked || this.touch) return; // a tap also sends mouse events
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (this.touch) return;
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked || this.touch) return; // a tap also sends mouse events
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => this.#setLocked(document.pointerLockElement === canvas));
  }

  #setLocked(locked) {
    if (locked === this.locked) return;
    this.locked = locked;
    if (!locked) { this.mouse.left = this.mouse.right = false; this.keys.clear(); this.touch?.reset(); }
    this.onLockChange?.(locked);
  }

  // on a touch screen there is no pointer to lock: playing is the lock
  lock() {
    if (this.touch) { this.touch.enter(); this.#setLocked(true); return; }
    const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
    // some browsers reject unadjustedMovement: retry without it
    if (p?.catch) p.catch(() => this.canvas.requestPointerLock());
  }

  unlock() {
    if (this.touch) this.#setLocked(false);
    else if (document.pointerLockElement) document.exitPointerLock();
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  wasPressed(code) { return this.pressed.has(code); }

  resetLook() { this.yaw = 0; this.pitch = 0; }
  setLook(yaw, pitch = 0) { this.yaw = yaw; this.pitch = pitch; }

  // part of the weapon recoil is permanent: the simulation reports it and the view keeps it
  addPitch(p) { this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + p)); }

  // sensitivityScale: lower while aiming down sights; cardMode: digit keys pick an upgrade card
  buildCommand(sensitivityScale, cardMode = false) {
    const sens = 0.0015 * sensitivityScale * settings.sensitivity * this.lookScale;
    this.yaw -= this.mouse.dx * sens;
    this.pitch -= this.mouse.dy * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    let moveX = 0, moveZ = 0;
    if (this.down('KeyW', 'ArrowUp')) moveZ -= 1;
    if (this.down('KeyS', 'ArrowDown')) moveZ += 1;
    if (this.down('KeyA', 'ArrowLeft')) moveX -= 1;
    if (this.down('KeyD', 'ArrowRight')) moveX += 1;
    if (this.touch) { moveX += this.touch.moveX; moveZ += this.touch.moveZ; }

    let slot = null;
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].forEach((code, i) => { if (this.wasPressed(code)) slot = i; });

    const pickCard = cardMode ? slot : null;
    if (cardMode) slot = null;

    return {
      moveX, moveZ,
      pickCard,
      sprint: this.down('ShiftLeft', 'ShiftRight') || !!this.touch?.sprint,
      jump: this.wasPressed('Space'),
      fire: this.mouse.left,
      aim: this.mouse.right || !!this.touch?.aim,
      reload: this.wasPressed('KeyR'),
      use: this.down('KeyE'),
      grenade: this.wasPressed('KeyG'),
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
