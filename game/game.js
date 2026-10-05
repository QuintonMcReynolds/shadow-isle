// SHADOW ISLE: ESCAPE THE ABYSS  ·  CuetipLLC
//
// Cuetip is stranded on a crumbling island in the abyss. Collect soul shards to light the
// escape beacon, reach it, and jump to the next island, before the shadows catch you or the
// ground falls away.
//
// The simulation (class Run) has no rendering, so the same code drives real players and
// headless test bots (?bot=N&collector=URL).
"use strict";

const W = 320, H = 180, TILE = 10, COLS = 32, ROWS = 18;
const ABYSS = 0, LAND = 1, ROCK = 2;
const DT = 1 / 60;

// ------------------------------------------------------------------ difficulty & experiment

const TUNING = {
  playerSpeed: 62, playerRadius: 4,
  dashMult: 2.7, dashTime: 0.18, dashCooldown: 2.2,
  shadowRadius: 4, shardsToEscape: 6,
};

// exp1: "gentle_start" softens the first ~30 seconds of every run.
function gentle(variant, t) {
  if (variant !== "gentle_start") return 1;
  if (t < 20) return 0.55;
  if (t < 35) return 0.55 + 0.45 * (t - 20) / 15;
  return 1;
}
const Difficulty = {
  shadowSpeed: (t, wave, v) => Math.min(66, (22 + 0.32 * t) * (1 + 0.08 * wave)) * gentle(v, t),
  spawnInterval: (t, wave, v) => Math.max(1.2, 4.5 - 0.04 * t) / (1 + 0.12 * wave) / gentle(v, t),
  maxShadows: (t, wave) => 1 + Math.floor(t / 15) + wave,
  firstSpawn: (v) => (v === "gentle_start" ? 7 : 2.5),
  crumbleStart: (v) => (v === "gentle_start" ? 18 : 12),
  crumbleInterval: (t) => Math.max(1.8, 5.5 - 0.04 * t),
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ------------------------------------------------------------------ simulation

class Run {
  constructor(variant, seed, listener = () => {}) {
    this.variant = variant;
    this.rng = mulberry32(seed);
    this.emit = listener;          // (type, data) for sounds / particles / telemetry
    this.t = 0; this.wave = 0;
    this.shards = 0; this.escapes = 0; this.dashes = 0; this.tilesLost = 0;
    this.maxShadowCount = 0; this.firstShadowAt = null;
    this.over = null; this.transition = 0;
    this.tiles = new Uint8Array(COLS * ROWS);
    this.crack = new Float32Array(COLS * ROWS);
    this.player = { x: 0, y: 0, dashT: 0, cd: 0, face: 1, dx: 1, dy: 0, moving: false };
    this.newIsland();
  }

  idx(x, y) { return y * COLS + x; }
  tileAtCell(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return ABYSS;
    return this.tiles[this.idx(cx, cy)];
  }
  tileAt(px, py) { return this.tileAtCell(Math.floor(px / TILE), Math.floor(py / TILE)); }
  cracking(px, py) {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
    return this.crack[this.idx(cx, cy)] > 0;
  }

  newIsland() {
    const r = this.rng;
    this.tiles.fill(ABYSS); this.crack.fill(0);
    const cx = 15.5, cy = 8.5, rx = 12.4 + r() * 1.6, ry = 6.5 + r() * 0.9;
    const p1 = r() * 6.28, p2 = r() * 6.28;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
        const wob = 0.12 * Math.sin(3 * a + p1) + 0.08 * Math.sin(5 * a + p2);
        if (dx * dx + dy * dy < 1 + wob) this.tiles[this.idx(x, y)] = LAND;
      }
    }
    const rocks = Math.min(9, 4 + this.wave);
    for (let i = 0; i < rocks; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = Math.floor(r() * COLS), y = Math.floor(r() * ROWS);
        if (this.tileAtCell(x, y) !== LAND || Math.hypot(x - cx, y - cy) < 3.5) continue;
        this.tiles[this.idx(x, y)] = ROCK;
        if (r() < 0.6 && this.tileAtCell(x + 1, y) === LAND) this.tiles[this.idx(x + 1, y)] = ROCK;
        if (r() < 0.4 && this.tileAtCell(x, y + 1) === LAND) this.tiles[this.idx(x, y + 1)] = ROCK;
        break;
      }
    }
    const p = this.player;
    p.x = 16 * TILE; p.y = 9 * TILE; p.dashT = 0;
    this.shadows = [];
    this.islandShards = 0;
    this.beacon = null;
    this.spawnShard();
    const first = this.wave === 0;
    this.nextSpawn = this.t + (first ? Difficulty.firstSpawn(this.variant) : 2);
    this.nextCrumble = this.t + (first ? Difficulty.crumbleStart(this.variant) : 6);
  }

  landCells(filter) {
    const out = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (this.tiles[this.idx(x, y)] === LAND && !this.crack[this.idx(x, y)] && filter(x, y)) {
        out.push([x, y]);
      }
    }
    return out;
  }
  isEdge(x, y) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => this.tileAtCell(x + a, y + b) === ABYSS);
  }
  pick(cells) { return cells.length ? cells[Math.floor(this.rng() * cells.length)] : null; }
  center([x, y]) { return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 }; }

  spawnShard() {
    const p = this.player;
    let c = this.pick(this.landCells((x, y) => Math.hypot(x * TILE - p.x, y * TILE - p.y) > 60));
    if (!c) c = this.pick(this.landCells(() => true));
    this.shard = c ? this.center(c) : null;
  }
  spawnBeacon() {
    const p = this.player;
    let c = this.pick(this.landCells((x, y) => !this.isEdge(x, y) &&
      Math.hypot(x * TILE - p.x, y * TILE - p.y) > 80));
    if (!c) c = this.pick(this.landCells(() => true));
    this.beacon = c ? this.center(c) : null;
    this.emit("beacon", this.beacon);
  }

  hitsRock(x, y, r) {
    for (const [a, b] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      if (this.tileAt(x + a, y + b) === ROCK) return true;
    }
    return false;
  }
  move(e, dx, dy, r) {
    const nx = Math.max(r, Math.min(W - r, e.x + dx));
    if (!this.hitsRock(nx, e.y, r)) e.x = nx;
    const ny = Math.max(r, Math.min(H - r, e.y + dy));
    if (!this.hitsRock(e.x, ny, r)) e.y = ny;
  }

  // input: {mx, my in [-1, 1], dash: bool}
  step(input) {
    if (this.over) return;
    if (this.transition > 0) {
      this.transition -= DT;
      if (this.transition <= 0) this.newIsland();
      return;
    }
    this.t += DT;
    const p = this.player, T = TUNING;

    // --- Cuetip
    let mx = input.mx || 0, my = input.my || 0;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    p.moving = m > 0.15;
    if (p.moving) { const n = Math.hypot(mx, my); p.dx = mx / n; p.dy = my / n; if (mx) p.face = mx > 0 ? 1 : -1; }
    if (input.dash && p.cd <= 0 && p.dashT <= 0) {
      p.dashT = T.dashTime; p.cd = T.dashCooldown; this.dashes++; this.emit("dash", p);
    }
    p.cd = Math.max(0, p.cd - DT);
    if (p.dashT > 0) {
      p.dashT -= DT;
      this.move(p, p.dx * T.playerSpeed * T.dashMult * DT, p.dy * T.playerSpeed * T.dashMult * DT, T.playerRadius);
    } else {
      this.move(p, mx * T.playerSpeed * DT, my * T.playerSpeed * DT, T.playerRadius);
      if (this.tileAt(p.x, p.y) === ABYSS) return this.end("fell");
    }

    // --- shadows
    const v = this.variant, t = this.t, wave = this.wave;
    if (t >= this.nextSpawn && this.shadows.length < Difficulty.maxShadows(t, wave)) {
      const c = this.pick(this.landCells((x, y) => this.isEdge(x, y) &&
        Math.hypot(x * TILE - p.x, y * TILE - p.y) > 70));
      if (c) {
        const s = this.center(c);
        this.shadows.push({ x: s.x, y: s.y, rise: 0.6, wob: this.rng() * 6.28 });
        if (this.firstShadowAt === null) this.firstShadowAt = t;
        this.emit("spawn", s);
      }
      this.nextSpawn = t + Difficulty.spawnInterval(t, wave, v);
    }
    this.maxShadowCount = Math.max(this.maxShadowCount, this.shadows.length);
    const sp = Difficulty.shadowSpeed(t, wave, v);
    for (const s of this.shadows) {
      if (s.rise > 0) { s.rise -= DT; continue; }
      let ax = p.x - s.x, ay = p.y - s.y;
      const d = Math.hypot(ax, ay) || 1;
      ax /= d; ay /= d;
      for (const o of this.shadows) {          // keep the pack from stacking up
        if (o === s) continue;
        const ox = s.x - o.x, oy = s.y - o.y, od = Math.hypot(ox, oy);
        if (od > 0 && od < 12) { ax += (ox / od) * 0.6; ay += (oy / od) * 0.6; }
      }
      s.wob += DT * 5;
      ax += Math.cos(s.wob) * 0.15; ay += Math.sin(s.wob * 1.3) * 0.15;
      const n = Math.hypot(ax, ay) || 1;
      this.move(s, (ax / n) * sp * DT, (ay / n) * sp * DT, T.shadowRadius);
      if (p.dashT <= 0 && Math.hypot(s.x - p.x, s.y - p.y) < T.playerRadius + T.shadowRadius - 1) {
        return this.end("caught");
      }
    }

    // --- shards and beacon
    if (this.shard && (this.tileAt(this.shard.x, this.shard.y) !== LAND)) this.spawnShard();
    if (this.shard && dist(this.shard, p) < 9) {
      this.shards++; this.islandShards++;
      this.emit("shard", this.shard);
      if (this.islandShards >= T.shardsToEscape) { this.shard = null; this.spawnBeacon(); }
      else this.spawnShard();
    }
    if (this.beacon && this.tileAt(this.beacon.x, this.beacon.y) !== LAND) this.spawnBeacon();
    if (this.beacon && dist(this.beacon, p) < 8) {
      this.escapes++; this.wave++; this.beacon = null;
      this.transition = 1.4;
      this.emit("escape", { island: this.wave + 1, t: this.t });
      return;
    }

    // --- the island crumbles from the edges
    if (t >= this.nextCrumble) {
      const k = 1 + Math.floor(t / 25);
      const land = this.landCells(() => true).length;
      if (land > 40) {
        for (let i = 0; i < k; i++) {
          const c = this.pick(this.landCells((x, y) => this.isEdge(x, y)));
          if (c) this.crack[this.idx(c[0], c[1])] = 1.5;
        }
      }
      this.nextCrumble = t + Difficulty.crumbleInterval(t);
    }
    for (let i = 0; i < this.crack.length; i++) {
      if (this.crack[i] > 0) {
        this.crack[i] -= DT;
        if (this.crack[i] <= 0) {
          this.crack[i] = 0; this.tiles[i] = ABYSS; this.tilesLost++;
          this.emit("crumble", { x: (i % COLS) * TILE + 5, y: Math.floor(i / COLS) * TILE + 5 });
        }
      }
    }
  }

  get score() { return this.shards * 10 + this.escapes * 100 + Math.floor(this.t); }

  end(cause) {
    this.over = cause;
    this.emit("over", cause);
  }

  summary(cause = this.over, input = "keys") {
    return {
      duration_s: Math.round(this.t * 100) / 100, score: this.score, shards: this.shards,
      escapes: this.escapes, island: this.wave + 1, cause, dashes: this.dashes,
      max_shadows: this.maxShadowCount, tiles_lost: this.tilesLost,
      first_shadow_s: this.firstShadowAt === null ? null : Math.round(this.firstShadowAt * 10) / 10,
      death_x: Math.round(this.player.x), death_y: Math.round(this.player.y), input,
    };
  }
}

// ------------------------------------------------------------------ bot player (tests + demo)

class BotBrain {
  constructor(skill, rng) { this.skill = skill; this.rng = rng; this.wait = 0; this.cur = { mx: 0, my: 0, dash: false }; }
  think(run) {
    this.wait -= DT;
    if (this.wait > 0) return { ...this.cur, dash: false };
    this.wait = 0.05 + 0.3 * (1 - this.skill) * this.rng();
    const p = run.player, target = run.beacon || run.shard;
    let best = null, bestScore = -1e9, nearest = 1e9;
    for (const s of run.shadows) if (s.rise <= 0) nearest = Math.min(nearest, dist(s, p));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let sc = 0;
      if (target) {
        const tx = target.x - p.x, ty = target.y - p.y, d = Math.hypot(tx, ty) || 1;
        sc += (dx * tx + dy * ty) / d;
      }
      for (const s of run.shadows) {
        if (s.rise > 0) continue;
        const vx = p.x - s.x, vy = p.y - s.y, d = Math.hypot(vx, vy) || 1;
        if (d < 70) sc += ((dx * vx + dy * vy) / d) * ((70 - d) / 70) * 2.5;
      }
      for (const la of [4, 8, 14, 22]) {
        const tx = p.x + dx * la, ty = p.y + dy * la, tile = run.tileAt(tx, ty);
        if (tile === ABYSS) sc -= 9 * (26 - la) / 22;
        else if (run.cracking(tx, ty)) sc -= 4 * (26 - la) / 22;
        else if (tile === ROCK) sc -= 1.2 * (26 - la) / 22;
      }
      sc += (this.rng() - 0.5) * (1.6 - this.skill);
      if (sc > bestScore) { bestScore = sc; best = [dx, dy]; }
    }
    const dash = nearest < 16 && this.rng() < this.skill * 0.9;
    this.cur = { mx: best[0], my: best[1], dash };
    return this.cur;
  }
}

// ------------------------------------------------------------------ audio

const Sound = (() => {
  let ctx = null, muted = Telemetry.LS.get("si_muted") === "1";
  function beep(freq, dur, type = "square", vol = 0.05, slide = 0) {
    if (muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, ctx.currentTime + dur);
      g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
    } catch { /* no audio */ }
  }
  return {
    shard: () => { beep(880, 0.08); setTimeout(() => beep(1320, 0.1), 60); },
    dash: () => beep(220, 0.12, "sawtooth", 0.03, 300),
    spawn: () => beep(90, 0.25, "triangle", 0.05, -40),
    beacon: () => { beep(440, 0.15, "triangle"); setTimeout(() => beep(660, 0.25, "triangle"), 120); },
    escape: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.15, "triangle", 0.06), i * 90)),
    over: () => beep(160, 0.6, "sawtooth", 0.06, -120),
    crumble: () => beep(60 + Math.random() * 30, 0.12, "triangle", 0.03),
    toggle() { muted = !muted; Telemetry.LS.set("si_muted", muted ? "1" : "0"); return muted; },
    get muted() { return muted; },
  };
})();

// ------------------------------------------------------------------ rendering helpers

function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

function makeStarfield(seed) {
  const c = makeCanvas(W, H), g = c.getContext("2d"), r = mulberry32(seed);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#151a3a"); grad.addColorStop(1, "#05060f");
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {        // faint scanline streaks, like the poster's sky
    g.fillStyle = `rgba(80,95,150,${0.04 + r() * 0.06})`;
    g.fillRect(Math.floor(r() * W), Math.floor(r() * H), 3 + Math.floor(r() * 10), 1);
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = r() < 0.15 ? "#ffffff" : "#8c96c8";
    g.fillRect(Math.floor(r() * W), Math.floor(r() * H), 1, 1);
  }
  return c;
}

function makeTile(kind, seed) {
  const c = makeCanvas(TILE, TILE), g = c.getContext("2d"), r = mulberry32(seed);
  const base = kind === ROCK ? ["#6b6c73", "#5c5d63", "#7a7b82", "#4c4d52"]
    : ["#b9a988", "#ad9d7d", "#c4b594", "#a39374"];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    g.fillStyle = base[Math.floor(r() * base.length)];
    g.fillRect(x, y, 1, 1);
  }
  if (kind === ROCK) {
    g.fillStyle = "#8d8e95"; g.fillRect(1, 1, 7, 1); g.fillRect(1, 1, 1, 6);
    g.fillStyle = "#3a3b40"; g.fillRect(2, 8, 8, 2); g.fillRect(8, 2, 2, 8);
  }
  return c;
}

// ------------------------------------------------------------------ the game

class Game {
  constructor(canvas, { demo = false } = {}) {
    this.cv = canvas;
    this.g = canvas.getContext("2d");
    this.demo = demo;
    this.buf = makeCanvas(W, H);
    this.b = this.buf.getContext("2d");
    this.dark = makeCanvas(W, H);
    this.stars = makeStarfield(7);
    this.tileImgs = { [LAND]: [1, 2, 3, 4].map((s) => makeTile(LAND, s)), [ROCK]: [5, 6].map((s) => makeTile(ROCK, s)) };
    this.cuetipR = gridToCanvas(CUETIP);
    this.cuetipL = gridToCanvas(mirror(CUETIP));
    this.shadowImgs = SHADOW.map((s) => gridToCanvas(s));
    this.shardImg = gridToCanvas(SHARD);
    this.state = "title";
    this.keys = new Set();
    this.touch = { stick: null, vec: { x: 0, y: 0 }, dash: false, used: false };
    this.particles = [];
    this.best = Number(Telemetry.LS.get("si_best") || 0);
    this.runsSession = 0;
    this.runsTotal = Number(Telemetry.LS.get("si_runs") || 0);
    this.sessionStart = performance.now();
    this.acc = 0; this.last = performance.now(); this.time = 0;
    this.bot = demo ? new BotBrain(0.75, mulberry32(3)) : null;
    this.bindInput();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    this.cv.width = W * s; this.cv.height = H * s;
    this.scale = s;
    this.g.imageSmoothingEnabled = false;
  }

  // -------------------------------------------------- input
  bindInput() {
    addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      this.touch.used = false;
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "m") Sound.toggle();
      if (this.state === "title") {
        if (k === "d") Telemetry.setOptOut(!Telemetry.optedOut);
        else if (k === " " || k === "enter") this.start();
      } else if (this.state === "over") {
        if (k === " " || k === "enter") this.start();
        if (k === "escape") this.state = "title";
      } else if (this.state === "playing" && (k === "escape" || k === "p")) this.state = "paused";
      else if (this.state === "paused" && (k === "escape" || k === "p" || k === " ")) this.state = "playing";
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => { this.keys.clear(); if (this.state === "playing") this.state = "paused"; });

    const pos = (e) => {
      const r = this.cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    this.cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const p = pos(e);
      if (e.pointerType === "touch") this.touch.used = true;
      if (this.state === "title") {
        if (p.y > H - 14 && p.x < 140) { Telemetry.setOptOut(!Telemetry.optedOut); return; }
        if (p.y > H - 14 && p.x > W - 40) { Sound.toggle(); return; }
        return this.start();
      }
      if (this.state === "over") return this.start();
      if (this.state === "paused") { this.state = "playing"; return; }
      if (this.state !== "playing") return;
      if (p.x < W * 0.6) this.touch.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      else this.touch.dash = true;
    });
    this.cv.addEventListener("pointermove", (e) => {
      const s = this.touch.stick;
      if (!s || s.id !== e.pointerId) return;
      const p = pos(e);
      s.x = p.x; s.y = p.y;
      const dx = p.x - s.ox, dy = p.y - s.oy, d = Math.hypot(dx, dy), R = 22;
      this.touch.vec = d < 3 ? { x: 0, y: 0 } : { x: dx / Math.max(d, R), y: dy / Math.max(d, R) };
    });
    const up = (e) => {
      if (this.touch.stick && this.touch.stick.id === e.pointerId) {
        this.touch.stick = null; this.touch.vec = { x: 0, y: 0 };
      }
    };
    this.cv.addEventListener("pointerup", up);
    this.cv.addEventListener("pointercancel", up);
  }

  readInput() {
    if (this.bot) return this.bot.think(this.run);
    const k = this.keys;
    let mx = (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0);
    let my = (k.has("arrowdown") || k.has("s") ? 1 : 0) - (k.has("arrowup") || k.has("w") ? 1 : 0);
    if (this.touch.stick) { mx = this.touch.vec.x; my = this.touch.vec.y; }
    const dash = k.has(" ") || k.has("shift") || this.touch.dash;
    this.touch.dash = false;
    return { mx, my, dash };
  }

  // -------------------------------------------------- flow
  start() {
    this.runsSession++; this.runsTotal++;
    Telemetry.LS.set("si_runs", String(this.runsTotal));
    if (this.runsSession === 1) Telemetry.track("exposure", { experiment: CONFIG.EXPERIMENT_ID });
    Telemetry.track("run_start", { run_in_session: this.runsSession, run_overall: this.runsTotal });
    this.run = new Run(Telemetry.variant, (Math.random() * 2 ** 31) | 0, (type, d) => this.onRunEvent(type, d));
    this.particles = [];
    this.state = "playing";
  }

  onRunEvent(type, d) {
    if (Sound[type]) Sound[type]();
    if (type === "shard") this.burst(d.x, d.y, "#2de2ff", 10);
    if (type === "crumble") this.burst(d.x, d.y, "#7a6b55", 4);
    if (type === "escape") Telemetry.track("escape", { island: d.island, t: Math.round(d.t * 10) / 10 });
    if (type === "over") this.finishRun(d);
  }

  finishRun(cause) {
    const r = this.run;
    this.burst(r.player.x, r.player.y, cause === "caught" ? "#aa0a19" : "#4fa8ff", 24);
    Telemetry.track("run_end", r.summary(cause, this.bot ? "bot" : this.touch.used ? "touch" : "keys"));
    Telemetry.flush();
    this.lastScore = r.score;
    if (r.score > this.best) { this.best = r.score; this.newBest = true; Telemetry.LS.set("si_best", String(r.score)); }
    else this.newBest = false;
    this.state = "over";
    this.overAt = this.time;
    if (this.demo) setTimeout(() => this.start(), 1500);
  }

  quitRun() {  // the tab is closing mid-run
    if (this.state === "playing" || this.state === "paused") {
      Telemetry.track("run_end", this.run.summary("quit", this.touch.used ? "touch" : "keys"));
    }
    Telemetry.track("session_end", {
      session_s: Math.round((performance.now() - this.sessionStart) / 1000), runs: this.runsSession,
    });
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 20 + Math.random() * 50;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, color });
    }
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now; this.time += dt;
    if (this.state === "playing") {
      this.acc += dt;
      while (this.acc >= DT && this.state === "playing") { this.run.step(this.readInput()); this.acc -= DT; }
    } else this.acc = 0;
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.draw();
    this.g.drawImage(this.buf, 0, 0, this.cv.width, this.cv.height);
    requestAnimationFrame((t) => this.frame(t));
  }

  // -------------------------------------------------- drawing
  draw() {
    const b = this.b;
    b.imageSmoothingEnabled = false;
    b.drawImage(this.stars, 0, 0);
    if (this.state === "title") return this.drawTitle();
    this.drawWorld();
    this.drawHud();
    if (this.state === "paused") this.panel(["PAUSED", "", "PRESS P / TAP TO RESUME"]);
    if (this.state === "over") this.drawOver();
  }

  drawWorld() {
    const b = this.b, r = this.run, tm = this.time;
    // island
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x, t = r.tiles[i];
      if (t === ABYSS) continue;
      let shake = 0;
      if (r.crack[i] > 0) shake = Math.sin(tm * 60 + i) * (1.5 - r.crack[i]);
      const img = this.tileImgs[t][(x * 7 + y * 13) % this.tileImgs[t].length];
      b.drawImage(img, x * TILE + Math.round(shake), y * TILE);
      if (r.crack[i] > 0) {
        b.fillStyle = `rgba(0,0,0,${0.25 + 0.35 * (1.5 - r.crack[i]) / 1.5})`;
        b.fillRect(x * TILE, y * TILE, TILE, TILE);
        b.fillStyle = "#1a1410";
        b.fillRect(x * TILE + 2, y * TILE + 4, 6, 1); b.fillRect(x * TILE + 5, y * TILE + 2, 1, 6);
      }
      if (r.tileAtCell(x, y + 1) === ABYSS) {     // cliff lip toward the abyss
        b.fillStyle = "#5b4f3e"; b.fillRect(x * TILE, y * TILE + TILE, TILE, 3);
        b.fillStyle = "#2c261e"; b.fillRect(x * TILE, y * TILE + TILE + 3, TILE, 2);
      }
    }
    // beacon
    if (r.beacon) {
      const { x, y } = r.beacon, pulse = 0.5 + 0.5 * Math.sin(tm * 6);
      b.fillStyle = `rgba(170,10,25,${0.25 + 0.25 * pulse})`;
      b.beginPath(); b.arc(x, y, 9 + pulse * 3, 0, 6.28); b.fill();
      b.fillStyle = "#3b3c42"; b.fillRect(x - 3, y - 10, 6, 13);
      b.fillStyle = "#ff3b3b"; b.fillRect(x - 2, y - 14, 4, 4);
      b.fillStyle = "#ffffff"; b.fillRect(x - 1, y - 13, 2, 2);
    }
    // shard
    if (r.shard) {
      const bob = Math.round(Math.sin(tm * 4) * 1.5);
      b.fillStyle = "rgba(45,226,255,0.25)";
      b.beginPath(); b.arc(r.shard.x, r.shard.y, 6, 0, 6.28); b.fill();
      b.drawImage(this.shardImg, Math.round(r.shard.x - 2), Math.round(r.shard.y - 4 + bob));
    }
    // shadows
    for (const s of r.shadows) {
      const img = this.shadowImgs[Math.floor(tm * 6 + s.wob) % 2];
      if (s.rise > 0) {
        const f = 1 - s.rise / 0.6, h = Math.max(1, Math.round(img.height * f));
        b.drawImage(img, 0, 0, img.width, h, Math.round(s.x - 5), Math.round(s.y + 4 - h), img.width, h);
      } else b.drawImage(img, Math.round(s.x - 5), Math.round(s.y - 5));
    }
    // Cuetip
    const p = r.player;
    if (!r.over || r.over === "caught") {
      const img = p.face < 0 ? this.cuetipL : this.cuetipR;
      const bob = p.moving ? Math.round(Math.abs(Math.sin(tm * 12)) * -1.5) : 0;
      if (p.dashT > 0) {
        b.globalAlpha = 0.35;
        b.drawImage(img, Math.round(p.x - 12 - p.dx * 8), Math.round(p.y - 8 - p.dy * 8));
        b.globalAlpha = 1;
      }
      if (!(r.over === "caught" && Math.floor(tm * 10) % 2)) {
        b.drawImage(img, Math.round(p.x - 12), Math.round(p.y - 8 + bob));
      }
    }
    // night: darkness with a light around Cuetip, the shard and the beacon
    const d = this.dark.getContext("2d");
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, W, H);
    d.fillStyle = "rgba(4,5,18,0.62)"; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = "destination-out";
    const hole = (x, y, rad) => {
      const gr = d.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = gr; d.beginPath(); d.arc(x, y, rad, 0, 6.28); d.fill();
    };
    hole(p.x, p.y, 78);
    if (r.shard) hole(r.shard.x, r.shard.y, 22);
    if (r.beacon) hole(r.beacon.x, r.beacon.y, 40);
    b.drawImage(this.dark, 0, 0);
    // particles
    for (const q of this.particles) { b.fillStyle = q.color; b.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
    // escape transition
    if (r.transition > 0) {
      b.fillStyle = `rgba(255,255,255,${Math.min(1, (1.4 - r.transition) * 1.5) * 0.85})`;
      b.fillRect(0, 0, W, H);
      drawText(b, "ESCAPED!", W / 2, 70, "#aa0a19", 3, "center");
      drawText(b, `ISLAND ${r.wave + 1}`, W / 2, 100, "#151a3a", 1, "center");
    }
    // touch stick
    const s = this.touch.stick;
    if (s) {
      b.strokeStyle = "rgba(255,255,255,0.35)";
      b.beginPath(); b.arc(s.ox, s.oy, 22, 0, 6.28); b.stroke();
      b.fillStyle = "rgba(255,255,255,0.35)";
      b.beginPath(); b.arc(s.ox + this.touch.vec.x * 22, s.oy + this.touch.vec.y * 22, 7, 0, 6.28); b.fill();
    }
  }

  drawHud() {
    const b = this.b, r = this.run;
    const shards = r.beacon ? "BEACON LIT! RUN!" : `SHARDS ${r.islandShards}/${TUNING.shardsToEscape}`;
    drawText(b, shards, 4, 4, r.beacon ? "#ff3b3b" : "#2de2ff");
    drawText(b, String(r.score), W - 4, 4, "#ffffff", 1, "right");
    drawText(b, `ISLAND ${r.wave + 1}`, W - 4, 13, "#8c96c8", 1, "right");
    // dash meter
    const f = 1 - r.player.cd / TUNING.dashCooldown;
    b.fillStyle = "#151a3a"; b.fillRect(4, 14, 30, 3);
    b.fillStyle = f >= 1 ? "#4fa8ff" : "#2f6fc0"; b.fillRect(4, 14, Math.round(30 * f), 3);
    if (this.touch.used && this.state === "playing") drawText(b, "DASH", W - 30, H - 11, "rgba(255,255,255,0.4)");
  }

  panel(lines, y0 = 60) {
    const b = this.b;
    b.fillStyle = "rgba(5,6,15,0.75)"; b.fillRect(0, y0 - 10, W, lines.length * 11 + 18);
    lines.forEach((l, i) => drawText(b, l, W / 2, y0 + i * 11, i === 0 ? "#ffffff" : "#c8cbe0", 1, "center"));
  }

  drawOver() {
    const b = this.b, r = this.run;
    b.fillStyle = "rgba(5,6,15,0.72)"; b.fillRect(0, 40, W, 100);
    drawText(b, r.over === "caught" ? "CAUGHT BY THE SHADOWS" : "LOST TO THE ABYSS", W / 2, 50, "#aa0a19", 2, "center");
    drawText(b, `SCORE ${r.score}`, W / 2, 76, "#ffffff", 1, "center");
    drawText(b, this.newBest ? "NEW BEST!" : `BEST ${this.best}`, W / 2, 87, this.newBest ? "#2de2ff" : "#8c96c8", 1, "center");
    drawText(b, `${r.shards} SHARDS  ${r.escapes} ESCAPES  ${Math.floor(r.t)}S`, W / 2, 98, "#8c96c8", 1, "center");
    if (this.time - this.overAt > 0.6) drawText(b, this.touch.used ? "TAP TO RUN AGAIN" : "SPACE TO RUN AGAIN", W / 2, 120, "#ffffff", 1, "center");
  }

  drawTitle() {
    const b = this.b, tm = this.time;
    // island silhouette
    b.fillStyle = "#0b0c18";
    b.beginPath(); b.ellipse(W / 2, 150, 150, 26, 0, 0, 6.28); b.fill();
    const alt = (i, ch) => (ch === " " ? "#fff" : ["#ffffff", "#aa0a19"][(i) % 2]);
    drawText(b, "SHADOW ISLE", W / 2, 14, alt, 3, "center");
    drawText(b, "ESCAPE THE ABYSS", W / 2, 42, alt, 2, "center");
    const bob = Math.round(Math.sin(tm * 3) * 2);
    b.drawImage(this.cuetipR, 0, 0, 25, 12, W / 2 - 50, 66 + bob, 100, 48);
    if (Math.floor(tm * 2) % 2 === 0) drawText(b, this.touch.used || "ontouchstart" in window ? "TAP TO PLAY" : "PRESS SPACE TO PLAY", W / 2, 122, "#ffffff", 1, "center");
    drawText(b, "MOVE: WASD/ARROWS OR DRAG   DASH: SPACE OR TAP RIGHT", W / 2, 134, "#8c96c8", 1, "center");
    if (this.best) drawText(b, `BEST ${this.best}`, W / 2, 145, "#2de2ff", 1, "center");
    b.fillStyle = "#aa0a19"; b.fillRect(0, H - 14, W, 14);
    drawText(b, `PLAY STATS: ${Telemetry.optedOut ? "OFF" : "ON"} (D)`, 4, H - 10, "#ffd5d9");
    drawText(b, "CUETIPLLC", W / 2, H - 10, "#ffffff", 1, "center");
    drawText(b, Sound.muted ? "SOUND OFF" : "SOUND ON", W - 4, H - 10, "#ffd5d9", 1, "right");
  }
}

// ------------------------------------------------------------------ headless bots

async function runBots({ players, collector, seed }) {
  const done = (msg) => { document.title = "BOTS DONE " + msg; return fetch(collector + "/done", { method: "POST", body: msg }); };
  const log = document.getElementById("botlog");
  try {
    for (let i = 0; i < players; i++) {
      const r = mulberry32(seed * 100003 + i);
      const skill = (r() + r() + r()) / 3;
      const playerId = [8, 4, 4, 4, 12].map((n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("")).join("-");
      let clock = Date.UTC(2026, 9, 5) + Math.floor(r() * 14) * 864e5 + (9 + r() * 13) * 36e5;
      let runsTotal = 0, day = 0;
      for (let session = 0; session < 8; session++) {
        Telemetry.init({ bot: { playerId, clock: () => clock }, collector });
        Telemetry.track("session_start", { mobile: r() < 0.45, returning: session > 0, sessions_before: session, local_hour: new Date(clock).getUTCHours() });
        const sStart = clock;
        let runs = 0;
        while (runs < 15) {
          runs++; runsTotal++;
          if (runs === 1) Telemetry.track("exposure", { experiment: CONFIG.EXPERIMENT_ID });
          Telemetry.track("run_start", { run_in_session: runs, run_overall: runsTotal });
          const run = new Run(Telemetry.variant, Math.floor(r() * 2 ** 31), (type, d) => {
            if (type === "escape") Telemetry.track("escape", { island: d.island, t: Math.round(d.t * 10) / 10 });
          });
          const brain = new BotBrain(skill, r);
          while (!run.over && run.t < 600) { run.step(brain.think(run)); clock += DT * 1000; }
          Telemetry.track("run_end", run.summary(run.over || "quit", "bot"));
          // ASSUMED behaviour (see tools/README): longer runs and more skill -> keep playing
          const pCont = 1 / (1 + Math.exp(-(-0.4 + 1.0 * Math.log(1 + run.t / 20) + 0.8 * skill - 0.22 * runs)));
          if (r() > pCont) break;
          clock += 3000 + r() * 6000;
        }
        Telemetry.track("session_end", { session_s: Math.round((clock - sStart) / 1000), runs });
        await Telemetry.flush();
        const pReturn = 1 / (1 + Math.exp(-(-2.0 + 0.18 * runsTotal + 0.6 * skill)));
        if (r() > pReturn) break;
        const gap = 1 + Math.floor(r() * 3);
        day += gap;
        if (day > 14) break;
        clock += gap * 864e5 + (r() - 0.5) * 6 * 36e5;
      }
      if (log && i % 10 === 0) log.textContent = `bot ${i + 1}/${players}`;
      await new Promise((res) => setTimeout(res, 0));
    }
    await done(`${players}`);
  } catch (e) {
    await done("ERROR " + e.message);
  }
}

// ------------------------------------------------------------------ boot

(function boot() {
  if (window.__NO_BOOT) return;   // test page
  const q = new URLSearchParams(location.search);
  if (q.has("bot")) {
    runBots({ players: Number(q.get("bot")) || 50, collector: q.get("collector"), seed: Number(q.get("seed") || 1) });
    return;
  }
  const demo = q.has("demo");
  if (demo) Telemetry.setOptOut(true);
  Telemetry.init({ collector: q.get("collector") });
  const first = Telemetry.LS.get("si_first") || String(Date.now());
  Telemetry.LS.set("si_first", first);
  const sessions = Number(Telemetry.LS.get("si_sessions") || 0);
  Telemetry.LS.set("si_sessions", String(sessions + 1));
  let ref = "";
  try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch { /* ignore */ }
  Telemetry.track("session_start", {
    mobile: matchMedia("(pointer: coarse)").matches, viewport_w: innerWidth, viewport_h: innerHeight,
    referrer_host: ref, returning: sessions > 0, sessions_before: sessions,
    days_since_first: Math.floor((Date.now() - Number(first)) / 864e5), local_hour: new Date().getHours(),
  });
  window.addEventListener("error", (e) => Telemetry.track("client_error", { msg: String(e.message).slice(0, 200) }));
  const game = new Game(document.getElementById("screen"), { demo });
  window.addEventListener("pagehide", () => { game.quitRun(); Telemetry.flush(true); });
  if (demo) {
    game.start();
    const warp = Number(q.get("warp") || 0);     // fast-forward the demo (screenshots)
    for (let i = 0; i < warp / DT && !game.run.over; i++) game.run.step(game.bot.think(game.run));
    game.particles = [];
  }
  window.__game = game;
})();
