// "Bac à sable" mode: no waves and no end, for tests and experiments.
export class SandboxMode {
  constructor(sim) {
    this.sim = sim;
    this.id = 'sandbox';
    this.wave = 1;
    this.totalWaves = 1;
  }

  start() {}
  get enemiesLeft() { return this.sim.enemies.alive; }
  update() {}
}
