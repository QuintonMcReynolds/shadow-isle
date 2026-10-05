// Cuetip and the Last Lighthouse: point-and-click engine (input, walking, dialogue,
// inventory, hints, save, telemetry). The story itself lives in story.js.
"use strict";

const W = 320, H = 180, VIEW_H = 140, WALK_SPEED = 110;
const SLOT = { x: 6, y: 148, size: 22, gap: 4 };
const HINT_BTN = { x: 258, y: 148, w: 56, h: 22 };
const NUDGE_AFTER_S = 75;
const P = CONFIG.STORAGE_PREFIX;

const Sound = (() => {
  let ctx = null, muted = Telemetry.LS.get(P + "muted") === "1";
  function beep(freq, dur, type = "square", vol = 0.04, slide = 0, delay = 0) {
    if (muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ctx.currentTime + delay;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur);
    } catch { /* no audio */ }
  }
  return {
    click: () => beep(660, 0.04, "square", 0.02),
    pickup: () => { beep(784, 0.08, "triangle"); beep(1175, 0.12, "triangle", 0.04, 0, 0.07); },
    solve: () => [523, 659, 784].forEach((f, i) => beep(f, 0.14, "triangle", 0.05, 0, i * 0.08)),
    nope: () => beep(150, 0.12, "square", 0.03, -30),
    door: () => beep(90, 0.35, "sawtooth", 0.03, 40),
    shriek: () => beep(900, 0.5, "sawtooth", 0.04, -800),
    hint: () => beep(988, 0.1, "sine", 0.05),
    fanfare: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => beep(f, 0.22, "triangle", 0.06, 0, i * 0.14)),
    toggle() { muted = !muted; Telemetry.LS.set(P + "muted", muted ? "1" : "0"); return muted; },
    get muted() { return muted; },
  };
})();

// word-wrap for the 5x7 font (6 px per character)
function wrap(text, maxChars) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > maxChars) { lines.push(line); line = word; }
    else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  return lines;
}

const inRect = (p, [x, y, w, h]) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

class Game {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext("2d");
    this.buf = document.createElement("canvas"); this.buf.width = W; this.buf.height = H;
    this.b = this.buf.getContext("2d");
    this.dark = document.createElement("canvas"); this.dark.width = W; this.dark.height = VIEW_H;
    this.art = loadArt();
    this.mode = "title";        // title | play | ending
    this.s = null;              // story state
    this.mouse = { x: -1, y: -1, touch: false };
    this.selected = null;       // selected inventory item
    this.queue = [];            // pending story actions
    this.dlg = null;            // { who, pages, page, shown }
    this.fade = null;           // { t, dir, then }
    this.walk = null;           // { x, then }
    this.time = 0; this.last = performance.now();
    this.lastProgress = 0; this.nudged = {};
    this.exposed = false;
    this.save = this.loadSave();
    this.bindInput();
    this.resize();
    addEventListener("resize", () => this.resize());
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    this.cv.width = W * s; this.cv.height = H * s;
    this.scale = s;
    this.g.imageSmoothingEnabled = false;
  }

  // -------------------------------------------------- save
  loadSave() {
    try {
      const s = JSON.parse(Telemetry.LS.get(P + "save") || "null");
      return s && !s.done && Story.SCENES[s.scene] ? s : null;
    } catch { return null; }
  }
  writeSave() {
    if (this.s) Telemetry.LS.set(P + "save", JSON.stringify(this.s));
  }

  // -------------------------------------------------- flow
  start(resume) {
    this.s = resume && this.save ? this.save : Story.newState();
    this.mode = "play";
    this.selected = null; this.queue = []; this.dlg = null; this.walk = null;
    this.x = resume && this.save ? 160 : 150; this.face = 1;
    this.lastProgress = this.s.t; this.nudged = {};
    if (!this.exposed) { Telemetry.track("exposure", { experiment: CONFIG.EXPERIMENT_ID }); this.exposed = true; }
    Telemetry.track("game_start", { resumed: !!(resume && this.save), steps: this.s.solved.length });
    Telemetry.track("scene_enter", { scene: this.s.scene, t: Math.round(this.s.t) });
    this.fade = { t: 0, dir: -1 };
    if (!resume || !this.save) this.queue.push(...Story.INTRO);
    this.writeSave();
  }

  run(actions) { this.queue.push(...actions); }

  step(dt) {
    const s = this.s;
    if (this.fade) {
      this.fade.t += dt / 0.28;
      if (this.fade.t >= 1) {
        const then = this.fade.then;
        this.fade = this.fade.dir > 0 ? { t: 0, dir: -1 } : null;
        if (then) then();
      }
      return;
    }
    if (this.mode !== "play") return;
    if (!document.hidden) s.t += dt;
    if (this.dlg) {
      this.dlg.shown = Math.min(this.dlg.text.length, this.dlg.shown + dt * 70);
      return;
    }
    if (this.walk) {
      const d = this.walk.x - this.x;
      if (Math.abs(d) <= WALK_SPEED * dt) {
        this.x = this.walk.x;
        const then = this.walk.then;
        this.walk = null;
        if (then) then();
      } else {
        this.x += Math.sign(d) * WALK_SPEED * dt;
        this.face = Math.sign(d);
      }
      return;
    }
    if (this.queue.length) return this.process(this.queue.shift());
    this.maybeNudge();
  }

  process(a) {
    const s = this.s;
    if (a.say) return this.showLine(a.who, a.say);
    if (a.go) {
      const from = s.scene;
      Sound.door();
      this.fade = { t: 0, dir: 1, then: () => {
        Story.apply(s, a);
        const sc = Story.SCENES[s.scene];
        this.x = sc.entries[from] ?? 160;
        this.face = this.x > 160 ? -1 : 1;
        this.queue.unshift(...sc.enter(s));
        Telemetry.track("scene_enter", { scene: s.scene, t: Math.round(s.t) });
        this.writeSave();
      } };
      return;
    }
    if (a.end) {
      Story.apply(s, a);
      Telemetry.track("game_complete", { t: Math.round(s.t), hints: s.hints, nudges: s.nudges });
      Telemetry.flush();
      Telemetry.LS.set(P + "save", "null");
      this.save = null;
      Sound.fanfare();
      this.fade = { t: 0, dir: 1, then: () => { this.mode = "ending"; this.endT = 0; } };
      return;
    }
    const changed = Story.apply(s, a);
    if (!changed) return;
    if (a.give) { Sound.pickup(); this.flash = { item: a.give, t: 1.2 }; }
    if (a.solve) {
      if (a.solve === "shadow") Sound.shriek(); else Sound.solve();
      this.lastProgress = s.t;
      Telemetry.track("puzzle_solved", { step: a.solve, n: s.solved.length, t: Math.round(s.t), hints: s.hints, nudges: s.nudges });
      this.writeSave();
    }
  }

  showLine(who, text) {
    this.dlg = { who, text, shown: 0, lines: wrap(text, 52) };
  }

  advance() {
    if (!this.dlg) return;
    if (this.dlg.shown < this.dlg.text.length) { this.dlg.shown = this.dlg.text.length; return; }
    this.dlg = null;
    Sound.click();
  }

  hint(auto = false) {
    const s = this.s, goal = Story.currentGoal(s);
    if (!goal) return;
    const tier = auto ? 0 : Math.min((s.hintTier[goal.id] ?? -1) + 1, goal.hint.length - 1);
    s.hintTier[goal.id] = Math.max(s.hintTier[goal.id] ?? -1, tier);
    if (auto) s.nudges++; else s.hints++;
    Telemetry.track("hint_used", { goal: goal.id, tier, auto, t: Math.round(s.t) });
    Sound.hint();
    this.queue.push(auto ? { who: "cuetip", say: "HMM... " + goal.hint[0] } : { who: "hint", say: goal.hint[tier] });
    this.writeSave();
  }

  // experiment arm "nudge": if a player makes no progress for a while, Cuetip thinks out loud
  maybeNudge() {
    if (Telemetry.variant !== "nudge") return;
    const goal = Story.currentGoal(this.s);
    if (!goal || this.nudged[goal.id] || (this.s.hintTier[goal.id] ?? -1) >= 0) return;
    if (this.s.t - this.lastProgress < NUDGE_AFTER_S) return;
    this.nudged[goal.id] = true;
    this.hint(true);
  }

  // -------------------------------------------------- input
  hotspotAt(p) {
    if (p.y >= VIEW_H) return null;
    const hs = Story.visibleHotspots(this.s);
    for (let i = hs.length - 1; i >= 0; i--) if (inRect(p, hs[i].rect)) return hs[i];
    return null;
  }

  slotAt(p) {
    for (let i = 0; i < this.s.inv.length; i++) {
      if (inRect(p, [SLOT.x + i * (SLOT.size + SLOT.gap), SLOT.y, SLOT.size, SLOT.size])) return this.s.inv[i];
    }
    return null;
  }

  busy() { return this.dlg || this.fade || this.queue.length; }

  click(p, button = 0) {
    if (this.mode === "title") return this.clickTitle(p);
    if (this.mode === "ending") { if (this.endT > 6) { this.mode = "title"; } return; }
    if (this.dlg) return this.advance();
    if (this.fade || this.queue.length) return;
    if (button === 2) { this.selected = null; return; }
    if (p.y >= VIEW_H) {
      if (inRect(p, [HINT_BTN.x, HINT_BTN.y, HINT_BTN.w, HINT_BTN.h])) { this.selected = null; this.walk = null; return this.hint(); }
      const item = this.slotAt(p);
      if (!item) { this.selected = null; return; }
      Sound.click();
      if (!this.selected) this.selected = item;
      else if (this.selected === item) this.selected = null;
      else { const a = this.selected; this.selected = null; this.walk = null; this.run(Story.combine(this.s, a, item)); }
      return;
    }
    const hs = this.hotspotAt(p), item = this.selected;
    this.selected = null;
    if (!hs) {
      if (item) return;
      const sc = Story.SCENES[this.s.scene];
      if (p.y > sc.floor - 40) this.walk = { x: Math.max(26, Math.min(294, p.x)) };
      return;
    }
    const act = () => {
      const cx = hs.rect[0] + hs.rect[2] / 2;
      if (!hs.exit && Math.abs(cx - this.x) > 4) this.face = Math.sign(cx - this.x);
      const actions = Story.interact(this.s, hs.id, item);
      if (item && actions.length === 1 && actions[0].say && !hs.use?.[item]) Sound.nope();
      this.run(actions);
    };
    if (hs.walkX == null) { this.walk = null; act(); }
    else this.walk = { x: Math.max(hs.exit ? 0 : 26, Math.min(hs.exit ? 320 : 294, hs.walkX)), then: act };
  }

  clickTitle(p) {
    for (const btn of this.titleButtons()) {
      if (inRect(p, btn.rect)) { Sound.click(); return btn.fn(); }
    }
  }

  titleButtons() {
    const list = [];
    if (this.save) {
      list.push({ label: "CONTINUE", rect: [62, 128, 92, 16], fn: () => this.start(true) });
      list.push({ label: "NEW GAME", rect: [166, 128, 92, 16], fn: () => this.start(false) });
    } else {
      list.push({ label: "START", rect: [114, 128, 92, 16], fn: () => this.start(false) });
    }
    list.push({ label: "stats", rect: [0, H - 14, 130, 14], fn: () => Telemetry.setOptOut(!Telemetry.optedOut) });
    list.push({ label: "sound", rect: [W - 70, H - 14, 70, 14], fn: () => Sound.toggle() });
    return list;
  }

  bindInput() {
    const pos = (e) => {
      const r = this.cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    this.cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.mouse = { ...pos(e), touch: e.pointerType === "touch" };
      this.click(this.mouse, e.button);
    });
    this.cv.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      this.mouse = { ...pos(e), touch: false };
    });
    this.cv.addEventListener("pointerleave", () => { this.mouse = { x: -1, y: -1, touch: false }; });
    this.cv.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "m") Sound.toggle();
      if (this.mode === "title") {
        if (k === "d") Telemetry.setOptOut(!Telemetry.optedOut);
        if (k === "enter" || k === " ") this.start(!!this.save);
      } else if (this.mode === "play") {
        if (k === " " || k === "enter") { e.preventDefault(); this.advance(); }
        if (k === "escape") this.selected = null;
        if (k === "h" && !this.busy()) this.hint();
      } else if (this.mode === "ending" && this.endT > 6 && (k === " " || k === "enter")) this.mode = "title";
    });
  }

  // -------------------------------------------------- loop
  frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    if (this.mode === "ending") this.endT += dt;
    this.step(dt);
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  draw() {
    const b = this.b;
    b.fillStyle = "#05060f"; b.fillRect(0, 0, W, H);
    if (this.mode === "title") this.drawTitle();
    else if (this.mode === "ending") this.drawEnding();
    else { this.drawScene(); this.drawUi(); }
    if (this.fade) {
      const a = this.fade.dir > 0 ? this.fade.t : 1 - this.fade.t;
      b.fillStyle = `rgba(5,6,15,${Math.max(0, Math.min(1, a))})`; b.fillRect(0, 0, W, H);
    }
    this.g.drawImage(this.buf, 0, 0, W * this.scale, H * this.scale);
    let hover = false;
    if (this.mode === "play" && !this.busy()) hover = !!(this.hotspotAt(this.mouse) || (this.mouse.y >= VIEW_H && (this.slotAt(this.mouse) || inRect(this.mouse, [HINT_BTN.x, HINT_BTN.y, HINT_BTN.w, HINT_BTN.h]))));
    if (this.mode === "title") hover = this.titleButtons().some((btn) => inRect(this.mouse, btn.rect));
    this.cv.style.cursor = hover ? "pointer" : "default";
  }

  drawCuetip(x, floor, face, scale = 2) {
    const img = face < 0 ? this.art.cuetipL : this.art.cuetipR;
    const bob = this.walk ? Math.round(Math.abs(Math.sin(this.time * 12)) * -2) : Math.round(Math.sin(this.time * 2.5));
    this.b.drawImage(img, Math.round(x - 12.5 * scale), floor - 12 * scale + bob, 25 * scale, 12 * scale);
  }

  drawScene() {
    const b = this.b, s = this.s, t = this.time, f = (k) => !!s.flags[k];
    b.drawImage(this.art.bgs[s.scene], 0, 0);
    const blink = (n) => Math.floor(t * n) % 2 === 0;
    switch (s.scene) {
      case "beach":
        if (!f("rope_taken")) { ellipse(b, "#c8a165", 113, 106, 6, 3); ellipse(b, "#8a6a3a", 113, 106, 3, 1); px(b, "#c8a165", 118, 104, 8, 1); }
        for (let i = 0; i < 3; i++) if (!f("fish_caught") || i === 0) {
          const ph = t * 1.7 + i * 2.1;
          px(b, "#e0f0ff", 190 + Math.round(Math.sin(ph) * 14), 123 + (i % 2) * 2, 3, 1);
        }
        for (let x = 60; x < W; x += 4) px(b, "#ece8f6", x + Math.round(Math.sin(t + x) * 2), 100 + Math.round(Math.sin(x / 9 + t * 2)), 2, 1);
        break;
      case "village":
        b.drawImage(this.art.moss, 30, 105 + (blink(1.5) ? 0 : 1), 40, 26);
        b.drawImage(this.art.pip, 232, 70 + (blink(2) ? 0 : 1), 28, 28);
        break;
      case "cliff":
        if (f("gate_open")) { px(b, "#0a0610", 156, 100, 18, 24); ellipse(b, "#0a0610", 165, 99, 9, 4); px(b, "#e09040", 160, 116, 10, 8); }
        break;
      case "tower": {
        const glow = 0.6 + Math.sin(t * 7) * 0.2 + Math.sin(t * 13) * 0.1;
        b.fillStyle = `rgba(255,${120 + Math.round(glow * 40)},40,${glow})`;
        for (let x = 37; x < 66; x += 4) b.fillRect(x, 94, 3, 8);
        if (!f("lantern_taken")) b.drawImage(this.art.items.lantern, 111, 58, 20, 20);
        break;
      }
      case "lamp":
        if (f("lamp_lens")) { ellipse(b, "#2de2ff", 161, 66, 16, 18); ellipse(b, "#9af2ff", 161, 66, 10, 12); ellipse(b, "#2de2ff", 161, 66, 4, 5); }
        else { ellipse(b, "#0e1420", 161, 66, 16, 18); }
        px(b, f("lamp_oil") ? "#e8c040" : "#2a2214", 191, 104, 6, 10);
        break;
      case "cave":
        if (!f("shadow_gone")) { if (blink(4)) px(b, "#c8fbff", 246, 98, 2, 2); }
        else if (!f("lens_taken")) {
          ellipse(b, "#c9a227", 246, 96, 10, 7); ellipse(b, "#2de2ff", 246, 96, 8, 5); ellipse(b, "#c8fbff", 243, 94, 2, 1);
        }
        px(b, "#1b2844", 134, 118, 18, 4); px(b, "#2a3d66", 137, 114, 12, 5);
        break;
    }
    this.drawCuetip(this.x, Story.SCENES[s.scene].floor, this.face);
    if (s.scene === "cave") this.drawCaveDark();
    if (s.scene === "village" || s.scene === "beach" || s.scene === "cliff") this.drawExitArrows();
    this.drawHoverLabel();
    if (new URLSearchParams(location.search).has("debug")) {
      b.strokeStyle = "#0f0";
      for (const h of Story.visibleHotspots(s)) b.strokeRect(h.rect[0] + 0.5, h.rect[1] + 0.5, h.rect[2] - 1, h.rect[3] - 1);
    }
  }

  drawCaveDark() {
    const d = this.dark.getContext("2d"), s = this.s, t = this.time;
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, W, VIEW_H);
    d.fillStyle = "rgba(2,1,6,0.92)"; d.fillRect(0, 0, W, VIEW_H);
    d.globalCompositeOperation = "destination-out";
    const hole = (x, y, r) => {
      const gr = d.createRadialGradient(x, y, r * 0.2, x, y, r);
      gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = gr; d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const r = 92 + Math.sin(t * 9) * 3 + Math.sin(t * 5.3) * 2;
    hole(this.x, Story.SCENES.cave.floor - 16, r);
    hole(318, 70, 46);
    this.b.drawImage(this.dark, 0, 0);
    // warm lantern tint
    const cy = Story.SCENES.cave.floor - 16, warm = this.b.createRadialGradient(this.x, cy, 4, this.x, cy, r);
    warm.addColorStop(0, "rgba(255,190,90,0.16)"); warm.addColorStop(1, "rgba(255,190,90,0)");
    this.b.fillStyle = warm; this.b.fillRect(this.x - r, cy - r, r * 2, r * 2);
    if (!s.flags.shadow_gone) {
      const img = this.art.shadow[Math.floor(t * 3) % 2];
      const bob = Math.round(Math.sin(t * 2) * 2);
      const near = Math.abs(this.x - 246) < r * 0.9;
      this.b.globalAlpha = near ? 1 : 0.15;
      this.b.drawImage(img, 230, 70 + bob, 33, 24);
      this.b.globalAlpha = 1;
      if (!near) { px(this.b, "#ff2a2a", 236, 79 + bob, 6, 6); px(this.b, "#ff2a2a", 251, 79 + bob, 6, 6); }
    }
  }

  drawExitArrows() {
    const b = this.b, a = Math.floor(this.time * 2) % 2 ? "#ffffff" : "#c8c0e0";
    for (const h of Story.visibleHotspots(this.s)) {
      if (!h.exit) continue;
      const [x, y, w, hh] = h.rect, cy = y + hh / 2;
      if (x < 10) drawText(b, "(", 3, cy - 3, a); else drawText(b, ")", W - 8, cy - 3, a);
    }
  }

  drawHoverLabel() {
    if (this.busy() || this.mouse.touch) return;
    let label = null;
    const hs = this.hotspotAt(this.mouse);
    if (hs) label = this.selected ? `USE ${Story.itemName(this.s, this.selected)} ON ${hs.name}` : hs.name;
    else if (this.mouse.y >= VIEW_H) {
      const item = this.slotAt(this.mouse);
      if (item) label = this.selected && this.selected !== item ? `USE ${Story.itemName(this.s, this.selected)} ON ${Story.itemName(this.s, item)}` : Story.itemName(this.s, item);
    } else if (this.selected) label = `USE ${Story.itemName(this.s, this.selected)} ON...`;
    if (!label) return;
    const w = textWidth(label) + 8;
    this.b.fillStyle = "rgba(5,6,15,0.8)";
    this.b.fillRect(Math.round(W / 2 - w / 2), VIEW_H - 12, w, 11);
    drawText(this.b, label, W / 2, VIEW_H - 10, "#ffffff", 1, "center");
  }

  itemImg(item) {
    return item === "lantern" && this.s.flags.lantern_lit ? this.art.items.lantern_lit : this.art.items[item];
  }

  drawUi() {
    const b = this.b, s = this.s;
    b.fillStyle = "#120e1c"; b.fillRect(0, VIEW_H, W, H - VIEW_H);
    b.fillStyle = "#aa0a19"; b.fillRect(0, VIEW_H, W, 1);
    if (this.dlg) {
      const sp = Story.SPEAKERS[this.dlg.who] || Story.SPEAKERS.cuetip;
      drawText(b, sp.name, 6, VIEW_H + 4, sp.color);
      let left = Math.floor(this.dlg.shown);
      this.dlg.lines.slice(0, 3).forEach((line, i) => {
        const part = line.slice(0, Math.max(0, left));
        left -= line.length + 1;
        drawText(b, part, 6, VIEW_H + 14 + i * 9, "#ffffff");
      });
      if (this.dlg.shown >= this.dlg.text.length && Math.floor(this.time * 3) % 2) drawText(b, ">", W - 10, H - 9, "#2de2ff");
      return;
    }
    s.inv.forEach((item, i) => {
      const x = SLOT.x + i * (SLOT.size + SLOT.gap);
      b.fillStyle = this.selected === item ? "#2de2ff" : "#3a3048"; b.fillRect(x, SLOT.y, SLOT.size, SLOT.size);
      b.fillStyle = "#221a30"; b.fillRect(x + 1, SLOT.y + 1, SLOT.size - 2, SLOT.size - 2);
      b.drawImage(this.itemImg(item), x + 1, SLOT.y + 1, 20, 20);
    });
    if (!s.inv.length) drawText(b, "YOUR BAG IS EMPTY", SLOT.x, SLOT.y + 8, "#5a5070");
    const goal = Story.currentGoal(s);
    const pulse = Telemetry.variant === "nudge" && goal && this.nudged[goal.id] && (s.hintTier[goal.id] ?? -1) < 1 && Math.floor(this.time * 2) % 2;
    b.fillStyle = pulse ? "#ff4050" : "#aa0a19"; b.fillRect(HINT_BTN.x, HINT_BTN.y, HINT_BTN.w, HINT_BTN.h);
    drawText(b, "? HINT", HINT_BTN.x + HINT_BTN.w / 2, HINT_BTN.y + 8, "#ffffff", 1, "center");
    drawText(b, fmtTime(s.t), W - 6, H - 8, "#5a5070", 1, "right");
    if (this.selected) {
      const img = this.itemImg(this.selected);
      if (!this.mouse.touch && this.mouse.x >= 0) b.drawImage(img, Math.round(this.mouse.x) + 4, Math.round(this.mouse.y) + 4, 10, 10);
    }
    if (this.flash) {
      const a = Math.min(1, this.flash.t * 2);
      b.globalAlpha = a;
      b.fillStyle = "rgba(5,6,15,0.85)"; b.fillRect(W / 2 - 60, 30, 120, 34);
      b.drawImage(this.itemImg(this.flash.item), W / 2 - 10, 34, 20, 20);
      drawText(b, "GOT " + Story.itemName(s, this.flash.item), W / 2, 56, "#2de2ff", 1, "center");
      b.globalAlpha = 1;
    }
  }

  drawTitle() {
    const b = this.b, t = this.time;
    b.drawImage(this.art.bgs.cliff, 0, 0);
    b.fillStyle = "rgba(5,6,15,0.55)"; b.fillRect(0, 0, W, VIEW_H);
    b.fillStyle = "#05060f"; b.fillRect(0, VIEW_H, W, H - VIEW_H);
    const alt = (i, ch) => (ch === " " ? "#fff" : ["#ffffff", "#aa0a19"][i % 2]);
    drawText(b, "CUETIP", W / 2, 12, alt, 3, "center");
    drawText(b, "AND THE LAST LIGHTHOUSE", W / 2, 40, "#ffffff", 2, "center");
    drawText(b, "A SHADOW ISLE STORY", W / 2, 60, "#8c96c8", 1, "center");
    const bob = Math.round(Math.sin(t * 2.5) * 2);
    b.drawImage(this.art.cuetipR, 0, 0, 25, 12, W / 2 - 37, 76 + bob, 75, 36);
    for (const btn of this.titleButtons()) {
      if (btn.label === "stats" || btn.label === "sound") continue;
      const [x, y, w, h] = btn.rect, hot = inRect(this.mouse, btn.rect);
      b.fillStyle = hot ? "#ff4050" : "#aa0a19"; b.fillRect(x, y, w, h);
      drawText(b, btn.label, x + w / 2, y + 5, "#ffffff", 1, "center");
    }
    drawText(b, "CLICK OR TAP TO LOOK, TALK AND USE THINGS", W / 2, 152, "#8c96c8", 1, "center");
    b.fillStyle = "#aa0a19"; b.fillRect(0, H - 14, W, 14);
    drawText(b, `PLAY STATS: ${Telemetry.optedOut ? "OFF" : "ON"} (D)`, 4, H - 10, "#ffd5d9");
    drawText(b, "CUETIPLLC", W / 2 + 6, H - 10, "#ffffff", 1, "center");
    drawText(b, Sound.muted ? "SOUND OFF" : "SOUND ON", W - 4, H - 10, "#ffd5d9", 1, "right");
  }

  drawEnding() {
    const b = this.b, t = this.endT, s = this.s;
    b.drawImage(this.art.bgs.cliff, 0, 0);
    b.fillStyle = "#05060f"; b.fillRect(0, VIEW_H, W, H - VIEW_H);
    // lit lamp + sweeping beam
    px(b, "#ffe08a", 150, 4, 30, 14);
    px(b, "#fff6d0", 158, 6, 14, 10);
    const ang = Math.sin(t * 0.8) * 1.2, len = 360;
    const ax = 165, ay = 11;
    b.fillStyle = "rgba(255,230,140,0.28)";
    b.beginPath(); b.moveTo(ax, ay);
    b.lineTo(ax - Math.cos(ang - 0.12) * len, ay + Math.sin(ang - 0.12) * len * 0.25);
    b.lineTo(ax - Math.cos(ang + 0.12) * len, ay + Math.sin(ang + 0.12) * len * 0.25);
    b.closePath(); b.fill();
    b.beginPath(); b.moveTo(ax, ay);
    b.lineTo(ax + Math.cos(ang - 0.12) * len, ay - Math.sin(ang - 0.12) * len * 0.25);
    b.lineTo(ax + Math.cos(ang + 0.12) * len, ay - Math.sin(ang + 0.12) * len * 0.25);
    b.closePath(); b.fill();
    b.fillStyle = "rgba(255,200,100,0.10)"; b.fillRect(0, 0, W, VIEW_H);
    this.drawCuetip(196, 130, -1);
    const lines = [
      [0.5, "THE LIGHT OF LANTERNFALL BURNS AGAIN.", "#ffe08a"],
      [2.0, "THE SHADOWS SLINK BACK TO THE ABYSS.", "#ffffff"],
      [3.5, "AND THE COVE HAS A NEW KEEPER.", "#4fa8ff"],
    ];
    lines.forEach(([at, text, c], i) => { if (t > at) drawText(b, text, W / 2, 26 + i * 12 + 30, c, 1, "center"); });
    if (t > 5) {
      drawText(b, "THE END", W / 2, 146, "#ffffff", 2, "center");
      drawText(b, `TIME ${fmtTime(s.t)}   HINTS ${s.hints}`, W / 2, 164, "#8c96c8", 1, "center");
    }
    if (t > 6 && Math.floor(this.time * 2) % 2) drawText(b, "CLICK TO CONTINUE", W / 2, 173, "#5a5070", 1, "center");
  }
}

// ------------------------------------------------------------------ boot

(function boot() {
  if (window.__NO_BOOT) return;   // test page
  const q = new URLSearchParams(location.search);
  const dev = q.has("scene") || q.has("ending");
  if (dev) Telemetry.setOptOut(true);
  Telemetry.init({ collector: q.get("collector") });
  const sessions = Number(Telemetry.LS.get(P + "sessions") || 0);
  Telemetry.LS.set(P + "sessions", String(sessions + 1));
  let ref = "";
  try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch { /* ignore */ }
  Telemetry.track("session_start", {
    mobile: matchMedia("(pointer: coarse)").matches, viewport_w: innerWidth, viewport_h: innerHeight,
    referrer_host: ref, returning: sessions > 0, sessions_before: sessions, local_hour: new Date().getHours(),
  });
  addEventListener("error", (e) => Telemetry.track("client_error", { msg: String(e.message).slice(0, 200) }));
  const game = new Game(document.getElementById("screen"));
  const started = performance.now();
  addEventListener("pagehide", () => {
    if (game.s) game.writeSave();
    Telemetry.track("session_end", {
      session_s: Math.round((performance.now() - started) / 1000), scene: game.s ? game.s.scene : "title",
      steps: game.s ? game.s.solved.length : 0, done: !!(game.s && game.s.done),
    });
    Telemetry.flush(true);
  });
  // dev shortcuts for screenshots: ?scene=cave&inv=lantern&flags=lantern_lit,lantern_taken
  if (dev) {
    game.start(false);
    game.queue = []; game.fade = null;
    const s = game.s;
    if (q.get("scene")) s.scene = q.get("scene");
    (q.get("inv") || "").split(",").filter(Boolean).forEach((i) => s.inv.push(i));
    (q.get("flags") || "").split(",").filter(Boolean).forEach((k) => { s.flags[k] = true; });
    if (q.get("x")) game.x = Number(q.get("x"));
    if (q.get("say")) game.showLine("cuetip", q.get("say"));
    if (q.has("ending")) { game.mode = "ending"; game.endT = Number(q.get("ending")) || 8; }
    Telemetry.LS.set(P + "save", "null");
  }
  window.__game = game;
})();
