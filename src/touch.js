// Touch controls for phones and tablets, fed into Input like the keyboard and the mouse: a thumbstick
// that appears under the left thumb (pushed past its ring, it sprints), look by dragging anywhere
// else, and the action buttons on the right (#touch in index.html). The fire button looks too, so
// one thumb can shoot and aim at once. ?touch in the address forces them on a computer.
export const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

const STICK_R = 50; // px from the centre to the ring
const SPRINT_AT = 1.2; // the thumb this far past the ring (in rings) sprints
const LOOK_SPAN = 3.6; // radians turned by a drag across the whole screen width
const BASE_SENS = 0.0015; // Input's radians per mouse pixel at sensitivity 1
const KEYS = { jump: 'Space', reload: 'KeyR', grenade: 'KeyG', torch: 'KeyF' }; // one-shot buttons

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.root = document.getElementById('touch');
    this.base = document.getElementById('stick');
    this.knob = document.getElementById('stick-knob');
    this.moveX = 0;
    this.moveZ = 0;
    this.sprint = false;
    this.aimOn = false; // the aim button toggles for guns…
    this.aimHeld = false; // …and is held to parry with the melee weapon
    this.holdAim = false; // set by the game each frame: the melee weapon is out
    this.stick = null; // { id, x, y }: the pointer on the thumbstick and the stick's centre
    this.looks = new Map(); // pointer id -> last { x, y } of every finger turning the view
    this.held = new Map(); // pointer id -> the held button (fire, aim, action)
    document.body.classList.add('touch');

    this.root.addEventListener('pointerdown', (e) => this.#down(e));
    this.root.addEventListener('pointermove', (e) => this.#move(e));
    for (const type of ['pointerup', 'pointercancel']) this.root.addEventListener(type, (e) => this.#up(e));

    // weapons and upgrade cards are picked by touching them in the HUD
    const tap = (code) => { if (input.locked) input.pressed.add(code); };
    document.getElementById('slots').addEventListener('pointerdown', (e) => {
      const slot = e.target.closest('.slot');
      if (slot) tap(`Digit${Number(slot.dataset.slot) + 1}`);
    });
    document.getElementById('cards-list').addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.card');
      if (card) tap(`Digit${[...card.parentNode.children].indexOf(card) + 1}`);
    });

    // the game pauses when the phone turns upright, the app is left or full screen is left
    const portrait = matchMedia('(orientation: portrait)');
    const upright = () => { if (portrait.matches) input.unlock(); };
    portrait.addEventListener('change', upright);
    addEventListener('resize', upright); // some browsers miss the media change while turning
    document.addEventListener('visibilitychange', () => { if (document.hidden) input.unlock(); });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && this.wasFull) input.unlock(); this.wasFull = !!document.fullscreenElement; });
  }

  // play starts: the whole screen, held sideways (refused in some frames and browsers, never needed)
  enter() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  }

  // every finger lifted: the pause screen is up
  reset() {
    this.stick = null;
    this.looks.clear();
    this.held.clear();
    this.moveX = this.moveZ = 0;
    this.sprint = this.aimOn = this.aimHeld = false;
    this.input.keys.delete('KeyE');
    this.#drawStick(null);
    for (const b of this.root.querySelectorAll('.on')) b.classList.remove('on');
  }

  get aim() { return this.holdAim ? this.aimHeld : this.aimOn || this.aimHeld; }

  // the melee weapon parries while the button is held; a gun's aim toggles, and starts off
  setMelee(melee) {
    if (melee === this.holdAim) return;
    this.holdAim = melee;
    this.aimOn = false;
    if (!this.aimHeld) document.getElementById('t-aim').classList.remove('on');
  }

  // the use button shows only by a lever or a downed teammate; the torch's shows its state
  showAction(on) { document.getElementById('t-action').classList.toggle('hidden', !on); }
  showTorch(available, lit) {
    const b = document.getElementById('t-torch');
    b.classList.toggle('hidden', !available);
    b.classList.toggle('lit', lit);
  }

  #down(e) {
    if (!this.input.locked) return;
    e.preventDefault();
    try { this.root.setPointerCapture(e.pointerId); } catch {} // a finger already gone
    const act = e.target.closest('[data-act]')?.dataset.act;
    const pt = { x: e.clientX, y: e.clientY };
    if (act) {
      const btn = e.target.closest('[data-act]');
      btn.classList.add('on');
      if (KEYS[act]) { this.input.pressed.add(KEYS[act]); setTimeout(() => btn.classList.remove('on'), 120); return; }
      if (act === 'pause') { this.input.unlock(); return; }
      this.held.set(e.pointerId, btn);
      if (act === 'fire') { this.input.mouse.left = true; this.looks.set(e.pointerId, pt); }
      if (act === 'aim') { this.aimHeld = true; if (!this.holdAim) this.aimOn = !this.aimOn; }
      if (act === 'action') this.input.keys.add('KeyE');
    } else if (!this.stick && e.clientX < innerWidth * 0.42) {
      this.stick = { id: e.pointerId, ...pt };
      this.#drawStick(pt);
    } else {
      this.looks.set(e.pointerId, pt);
    }
  }

  #move(e) {
    if (this.stick?.id === e.pointerId) {
      let dx = e.clientX - this.stick.x, dy = e.clientY - this.stick.y;
      let d = Math.hypot(dx, dy);
      // a thumb that runs far off drags the stick along
      const far = STICK_R * 1.7;
      if (d > far) {
        this.stick.x += (dx / d) * (d - far);
        this.stick.y += (dy / d) * (d - far);
        dx = e.clientX - this.stick.x; dy = e.clientY - this.stick.y; d = far;
      }
      const k = Math.min(1, d / STICK_R) / (d || 1);
      this.moveX = dx * k;
      this.moveZ = dy * k;
      this.sprint = d > STICK_R * SPRINT_AT && -dy > Math.abs(dx);
      this.#drawStick(this.stick, dx * k * STICK_R, dy * k * STICK_R);
      return;
    }
    const last = this.looks.get(e.pointerId);
    if (!last) return;
    const scale = LOOK_SPAN / innerWidth / BASE_SENS;
    this.input.mouse.dx += (e.clientX - last.x) * scale;
    this.input.mouse.dy += (e.clientY - last.y) * scale;
    last.x = e.clientX;
    last.y = e.clientY;
  }

  #up(e) {
    if (this.stick?.id === e.pointerId) {
      this.stick = null;
      this.moveX = this.moveZ = 0;
      this.sprint = false;
      this.#drawStick(null);
    }
    this.looks.delete(e.pointerId);
    const btn = this.held.get(e.pointerId);
    if (!btn) return;
    this.held.delete(e.pointerId);
    const act = btn.dataset.act;
    if (act === 'fire') this.input.mouse.left = false;
    if (act === 'aim') this.aimHeld = false;
    if (act === 'action') this.input.keys.delete('KeyE');
    // a toggled aim stays lit
    if (!(act === 'aim' && this.aim)) btn.classList.remove('on');
  }

  // the stick at rest sits faint in the corner; under the thumb it follows it
  #drawStick(at, kx = 0, ky = 0) {
    this.base.classList.toggle('active', !!at);
    this.base.classList.toggle('sprint', this.sprint);
    this.base.style.transform = at ? `translate(${at.x}px, ${at.y}px)` : '';
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }
}
