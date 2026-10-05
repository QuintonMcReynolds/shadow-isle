// Pixel art for Last Lighthouse. Backgrounds are painted once per scene onto a 320x140 canvas
// with fillRect only (no anti-aliasing), so they stay crisp when scaled up.
"use strict";

const SW = 320, SH = 140;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function px(g, c, x, y, w = 1, h = 1) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// vertical gradient through evenly spaced color stops, ordered-dithered
function vgrad(g, x, y, w, h, stops) {
  for (let j = 0; j < h; j++) {
    const t = (j / Math.max(1, h - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), fr = t - i;
    let runC = null, runX = 0;
    for (let k = 0; k <= w; k++) {
      const c = k === w ? null : fr > (BAYER[((y + j) % 4) * 4 + ((x + k) % 4)] + 0.5) / 16 ? stops[i + 1] : stops[i];
      if (c !== runC) {
        if (runC) px(g, runC, x + runX, y + j, k - runX, 1);
        runC = c; runX = k;
      }
    }
  }
}

function ellipse(g, c, cx, cy, rx, ry) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    px(g, c, cx - half, cy + dy, half * 2 + 1, 1);
  }
}

// scanline polygon fill
function poly(g, c, pts) {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.round(xs[i]), b = Math.round(xs[i + 1]);
      if (b > a) px(g, c, a, y, b - a, 1);
    }
  }
}

function speck(g, c, x, y, w, h, n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) px(g, c, x + Math.floor(r() * w), y + Math.floor(r() * h));
}

function sprite(rows, pal) {
  const w = Math.max(...rows.map((r) => r.length));
  return gridToCanvas(rows.map((r) => r.padEnd(w, ".")), pal);
}

// ------------------------------------------------------------------ shared pieces

const SKY = ["#0b0920", "#17113a", "#2c1a4f", "#4c255d", "#7a3560", "#a24e5e"];

function sky(g, h, seed = 1) {
  vgrad(g, 0, 0, SW, h, SKY);
  const r = rng(seed);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(r() * SW), y = Math.floor(r() * h * 0.55);
    px(g, r() < 0.2 ? "#ffffff" : "#8f88c0", x, y);
  }
}

function moon(g, x, y) {
  ellipse(g, "#f3e9c6", x, y, 6, 6);
  ellipse(g, "#120e30", x + 3, y - 2, 5, 5);
}

function sea(g, y, h, seed) {
  vgrad(g, 0, y, SW, h, ["#2c2756", "#1e2552", "#152047"]);
  const r = rng(seed);
  for (let i = 0; i < 40; i++) {
    const yy = y + 2 + Math.floor(r() * (h - 3));
    px(g, r() < 0.3 ? "#6a5a8a" : "#3a3f75", Math.floor(r() * SW), yy, 3 + Math.floor(r() * 10), 1);
  }
}

function lighthouseFar(g, x, y) {   // x: left of tower, y: tower top
  poly(g, "#241c34", [[x, y + 26], [x + 2, y + 4], [x + 8, y + 4], [x + 10, y + 26]]);
  px(g, "#3b1b2c", x + 1, y + 10, 8, 3);
  px(g, "#3b1b2c", x + 1, y + 18, 9, 3);
  px(g, "#352c48", x, y, 10, 4);
  poly(g, "#1c1628", [[x - 1, y], [x + 5, y - 5], [x + 11, y]]);
}

// ------------------------------------------------------------------ scenes

function paintBeach(g) {
  sky(g, 74, 3);
  moon(g, 36, 16);
  // headland and the dark lighthouse
  poly(g, "#1a1430", [[200, 74], [236, 54], [262, 47], [300, 45], [320, 48], [320, 74]]);
  poly(g, "#231a3c", [[236, 56], [262, 49], [300, 47], [320, 50], [320, 56]]);
  lighthouseFar(g, 275, 20);
  sea(g, 72, 28, 5);
  vgrad(g, 0, 100, SW, 40, ["#6e5640", "#9a7650", "#b48c5c", "#c49d68"]);
  for (let x = 58; x < SW; x++) px(g, "#cfcbe0", x, 100 + Math.round(Math.sin(x / 9) * 1.2), 1, 1);
  speck(g, "#8c6a44", 0, 104, SW, 36, 260, 11);
  speck(g, "#d8b680", 0, 106, SW, 34, 120, 12);
  // rocks + sea cave
  poly(g, "#221a2e", [[0, 26], [20, 22], [40, 36], [54, 66], [60, 104], [52, 122], [0, 126]]);
  poly(g, "#332844", [[0, 30], [18, 26], [34, 38], [46, 64], [48, 96], [0, 102]]);
  poly(g, "#40344f", [[0, 34], [14, 30], [26, 40], [30, 60], [0, 66]]);
  poly(g, "#06040b", [[10, 122], [11, 92], [20, 78], [32, 80], [40, 96], [42, 122]]);
  speck(g, "#4a3d5a", 0, 30, 46, 70, 40, 13);
  // wrecked rowboat
  poly(g, "#4a2f1e", [[70, 114], [124, 104], [134, 112], [118, 126], [82, 128]]);
  poly(g, "#6e4a2e", [[72, 113], [124, 103], [129, 108], [76, 117]]);
  for (let i = 0; i < 4; i++) px(g, "#341f12", 82 + i * 10, 118 - i * 2, 9, 1);
  poly(g, "#3e2817", [[98, 106], [101, 106], [90, 78], [87, 79]]);
  px(g, "#c49d68", 104, 120, 6, 4);   // hole in the hull
  // tide pool
  ellipse(g, "#5a5266", 201, 124, 28, 8);
  ellipse(g, "#25607c", 201, 124, 24, 6);
  ellipse(g, "#3a86a0", 196, 122, 13, 2);
  for (const [x, y] of [[176, 120], [228, 126], [222, 118], [182, 129]]) ellipse(g, "#7a7088", x, y, 3, 2);
  // driftwood + shells
  px(g, "#7a5a3c", 250, 126, 22, 3); px(g, "#5a3f28", 256, 125, 4, 1);
  px(g, "#f0d6c8", 150, 132, 2, 1); px(g, "#f0d6c8", 280, 116, 2, 1);
}

function cottage(g, x, w, h, wall, roof, seed) {
  const base = 104;
  px(g, wall, x, base - h, w, h);
  speck(g, "#00000033", x, base - h, w, h, w * 2, seed);
  poly(g, roof, [[x - 4, base - h + 1], [x + w / 2, base - h - 18], [x + w + 4, base - h + 1]]);
  poly(g, "#00000040", [[x + w / 2, base - h - 18], [x + w + 4, base - h + 1], [x + w / 2, base - h + 1]]);
  // shuttered windows
  for (const wx of [x + 6, x + w - 18]) {
    px(g, "#2a1a14", wx, base - h + 8, 12, 12);
    px(g, "#5e3a24", wx + 1, base - h + 9, 5, 10);
    px(g, "#5e3a24", wx + 6, base - h + 9, 5, 10);
  }
  px(g, "#3a2418", x + w / 2 - 6, base - 22, 12, 22);
  px(g, "#c9a227", x + w / 2 + 3, base - 12, 1, 2);
}

function paintVillage(g) {
  sky(g, 80, 7);
  moon(g, 120, 14);
  lighthouseFar(g, 300, 30);
  poly(g, "#1a1430", [[280, 80], [296, 56], [320, 54], [320, 80]]);
  // back row of roofs
  poly(g, "#1d1630", [[0, 80], [20, 62], [40, 80]]);
  poly(g, "#1d1630", [[180, 80], [204, 60], [228, 80]]);
  px(g, "#1d1630", 0, 76, SW, 6);
  cottage(g, 6, 70, 44, "#5a4860", "#7a2a30", 21);
  cottage(g, 92, 38, 34, "#4b4864", "#33506e", 22);
  cottage(g, 276, 50, 40, "#55465c", "#2f4a3a", 23);
  // cobbles
  vgrad(g, 0, 104, SW, 36, ["#3a3044", "#4a3e52", "#5a4c5e"]);
  const r = rng(31);
  for (let row = 0; row < 6; row++) {
    const y = 106 + row * 6, off = (row % 2) * 6;
    for (let x = -off; x < SW; x += 12) px(g, "#2e2638", x + Math.floor(r() * 3), y, 1, 5);
    px(g, "#2e2638", 0, y + 5, SW, 1);
  }
  // well
  px(g, "#5a5466", 140, 96, 34, 26);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) px(g, "#46404f", 140 + j * 7 + (i % 2) * 3, 99 + i * 6, 1, 5);
  for (let i = 1; i < 4; i++) px(g, "#46404f", 140, 96 + i * 6, 34, 1);
  ellipse(g, "#6e6878", 157, 96, 18, 3);
  ellipse(g, "#0a0812", 157, 96, 14, 2);
  px(g, "#5a3a24", 142, 70, 3, 26); px(g, "#5a3a24", 169, 70, 3, 26);
  px(g, "#6a4428", 142, 74, 30, 2);
  poly(g, "#7a2a30", [[134, 72], [157, 58], [180, 72]]);
  px(g, "#c8a165", 156, 76, 1, 6);   // frayed rope end
  // Pip's stall
  px(g, "#4a2f1e", 222, 66, 3, 34); px(g, "#4a2f1e", 275, 66, 3, 34);
  for (let i = 0; i < 11; i++) px(g, i % 2 ? "#e8e0d0" : "#aa0a19", 216 + i * 6, 56, 6, 10);
  for (let i = 0; i < 11; i++) ellipse(g, i % 2 ? "#e8e0d0" : "#aa0a19", 219 + i * 6, 66, 3, 2);
  px(g, "#6a4428", 218, 98, 64, 4);
  px(g, "#4f321e", 220, 102, 60, 20);
  for (let i = 0; i < 4; i++) px(g, "#3c2516", 220, 106 + i * 4, 60, 1);
  for (const jx of [226, 262, 270]) { px(g, "#7a5a3a", jx, 90, 6, 8); px(g, "#e0b040", jx + 1, 93, 4, 2); px(g, "#9a7a5a", jx + 2, 88, 2, 2); }
  // lobster pots + barrel by Moss
  px(g, "#5a3a24", 70, 108, 14, 16); px(g, "#3a2418", 70, 112, 14, 1); px(g, "#3a2418", 70, 119, 14, 1);
  // path up to the cliff
  poly(g, "#6b5a48", [[290, 140], [300, 104], [310, 84], [320, 76], [320, 140]]);
  speck(g, "#4f4234", 292, 80, 28, 60, 30, 32);
}

function paintCliff(g) {
  sky(g, 98, 9);
  moon(g, 270, 20);
  sea(g, 84, 18, 15);
  vgrad(g, 0, 100, SW, 40, ["#1d3428", "#24402f", "#2d4c38", "#33573f"]);
  poly(g, "#1d3428", [[0, 96], [60, 98], [120, 102], [0, 104]]);
  speck(g, "#3f6a4c", 0, 104, SW, 36, 160, 41);
  speck(g, "#162a20", 0, 104, SW, 36, 120, 42);
  // dirt path to the door
  poly(g, "#5e4e3e", [[0, 122], [60, 120], [140, 124], [160, 124], [190, 126], [190, 134], [100, 134], [0, 136]]);
  speck(g, "#4a3c2e", 0, 120, 190, 16, 50, 43);
  // lighthouse tower
  const lx = (y, side) => side < 0 ? 136 + (122 - y) * 0.09 : 194 - (122 - y) * 0.09;
  poly(g, "#d8d0c4", [[lx(122, -1), 122], [lx(24, -1), 24], [lx(24, 1), 24], [lx(122, 1), 122]]);
  for (const [a, b] of [[34, 48], [62, 76], [90, 104]]) {
    poly(g, "#aa0a19", [[lx(b, -1), b], [lx(a, -1), a], [lx(a, 1), a], [lx(b, 1), b]]);
  }
  poly(g, "#00000038", [[168, 122], [168, 24], [lx(24, 1), 24], [lx(122, 1), 122]]);
  px(g, "#2c2438", 140, 18, 50, 6);     // gallery
  for (let x = 141; x < 190; x += 4) px(g, "#4a405a", x, 14, 1, 4);
  px(g, "#4a405a", 140, 14, 50, 1);
  px(g, "#1e2a40", 150, 4, 30, 14);     // lamp room glass (dark)
  for (let x = 150; x <= 180; x += 10) px(g, "#3a3048", x, 4, 2, 14);
  poly(g, "#2a2236", [[146, 4], [165, -6], [184, 4]]);
  // door
  px(g, "#2a1c14", 154, 98, 22, 26);
  ellipse(g, "#2a1c14", 165, 98, 11, 6);
  px(g, "#5a3a24", 156, 100, 18, 24);
  ellipse(g, "#5a3a24", 165, 99, 9, 4);
  px(g, "#3a3a44", 156, 106, 18, 2); px(g, "#3a3a44", 156, 116, 18, 2);
  px(g, "#c9a227", 170, 110, 2, 3);
  // rocks + fence
  ellipse(g, "#3a3446", 240, 128, 14, 6); ellipse(g, "#4a4258", 236, 126, 8, 3);
  for (let x = 30; x < 120; x += 16) px(g, "#4a3424", x, 108, 2, 12);
  px(g, "#4a3424", 30, 111, 90, 1);
}

function paintTower(g) {
  vgrad(g, 0, 0, SW, 110, ["#1c1726", "#262033", "#302840", "#3a3046"]);
  for (let row = 0; row < 18; row++) {
    const y = row * 6, off = (row % 2) * 8;
    px(g, "#1c1726", 0, y + 5, SW, 1);
    for (let x = -off; x < SW; x += 16) px(g, "#1c1726", x, y, 1, 5);
  }
  vgrad(g, 0, 108, SW, 32, ["#3e2a1c", "#54392a", "#5e4130"]);
  for (let i = 0; i < 5; i++) px(g, "#3a2618", 0, 112 + i * 6, SW, 1);
  for (let x = 10; x < SW; x += 37) px(g, "#3a2618", x, 108, 1, 32);
  // window slit
  px(g, "#120e1c", 148, 20, 12, 34);
  vgrad(g, 150, 22, 8, 30, ["#17113a", "#4c255d"]);
  px(g, "#ffffff", 153, 28);
  // door
  px(g, "#2a1c14", 0, 60, 22, 50);
  px(g, "#5a3a24", 2, 64, 16, 46);
  px(g, "#3a3a44", 2, 72, 16, 2); px(g, "#3a3a44", 2, 96, 16, 2);
  px(g, "#c9a227", 14, 86, 2, 3);
  // stove + pipe
  px(g, "#2a2a34", 44, 0, 8, 66);
  px(g, "#34343e", 44, 0, 2, 66);
  px(g, "#1e1e26", 26, 66, 48, 44);
  px(g, "#33333f", 24, 64, 52, 4);
  px(g, "#33333f", 28, 108, 4, 6); px(g, "#33333f", 68, 108, 4, 6);
  px(g, "#0e0e14", 34, 84, 32, 18);
  for (let x = 36; x < 66; x += 4) px(g, "#33333f", x, 84, 1, 18);
  // hook
  px(g, "#5a3a24", 104, 50, 34, 3);
  px(g, "#8a8a96", 120, 53, 1, 6);
  // desk + journal
  px(g, "#6a4428", 184, 92, 64, 4);
  px(g, "#4a2f1e", 188, 96, 4, 14); px(g, "#4a2f1e", 240, 96, 4, 14);
  px(g, "#e8dcc0", 202, 86, 12, 6); px(g, "#d8ccb0", 214, 86, 12, 6);
  px(g, "#8a7a5a", 213, 86, 1, 6);
  for (let i = 0; i < 3; i++) { px(g, "#9a8a6a", 204, 87 + i * 2, 8, 1); px(g, "#9a8a6a", 216, 87 + i * 2, 8, 1); }
  px(g, "#e8e0d0", 236, 84, 3, 8); px(g, "#3a2a1a", 237, 83, 1, 1);
  // spiral stairs
  for (let i = 0; i < 9; i++) {
    const y = 104 - i * 11, x = 256 + (i % 2) * 18;
    px(g, "#6a4a32", x, y, 40, 4);
    px(g, "#4a3222", x, y + 4, 40, 2);
  }
  px(g, "#4a3424", 300, 6, 3, 104);
  px(g, "#120e1c", 254, 0, 66, 4);
}

function paintLamp(g) {
  sky(g, 100, 17);
  sea(g, 66, 34, 18);
  // the cove below, dark
  poly(g, "#15102a", [[0, 100], [0, 74], [30, 70], [70, 76], [110, 72], [130, 80], [130, 100]]);
  for (let i = 0; i < 6; i++) px(g, "#241c3a", 10 + i * 18, 80 + (i % 2) * 4, 8, 6);
  // window frames
  px(g, "#1a1622", 0, 0, SW, 8);
  for (let x = 0; x <= SW; x += 66) px(g, "#1a1622", x - 3, 0, 7, 104);
  px(g, "#2a2434", 0, 100, SW, 6);
  // floor grating
  vgrad(g, 0, 106, SW, 34, ["#2a2a34", "#34343e", "#3c3c48"]);
  for (let x = 0; x < SW; x += 6) px(g, "#22222a", x, 106, 1, 34);
  for (let y = 108; y < SH; y += 6) px(g, "#22222a", 0, y, SW, 1);
  // stairs opening
  px(g, "#07060c", 12, 114, 44, 14);
  px(g, "#4a4a56", 10, 110, 48, 2);
  px(g, "#4a4a56", 10, 110, 2, 18); px(g, "#4a4a56", 56, 110, 2, 18);
  // great lamp
  px(g, "#6a5222", 140, 96, 42, 26);
  px(g, "#8a6a2a", 140, 96, 42, 3);
  px(g, "#5a4418", 136, 118, 50, 4);
  px(g, "#8a6a2a", 134, 36, 54, 60);
  px(g, "#b08a3a", 134, 36, 54, 2);
  px(g, "#b08a3a", 134, 94, 54, 2);
  px(g, "#1c2636", 138, 40, 46, 54);
  for (let x = 138; x < 184; x += 11) px(g, "#6a5222", x, 40, 1, 54);
  poly(g, "#8a6a2a", [[134, 36], [161, 24], [188, 36]]);
  // oil reservoir
  px(g, "#5a4418", 188, 100, 12, 18);
  px(g, "#8a6a2a", 190, 98, 8, 2);
}

function paintCave(g) {
  vgrad(g, 0, 0, SW, SH, ["#0c0914", "#151020", "#1d1630", "#241c36"]);
  const r = rng(51);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * 290), w = 6 + Math.floor(r() * 10), h = 10 + Math.floor(r() * 26);
    poly(g, "#2a2040", [[x, 0], [x + w, 0], [x + w / 2, h]]);
  }
  poly(g, "#2a2236", [[0, 112], [80, 108], [180, 112], [320, 110], [320, 140], [0, 140]]);
  speck(g, "#3a4a6a", 0, 112, SW, 28, 70, 52);
  ellipse(g, "#142038", 92, 126, 34, 6);
  ellipse(g, "#1e3050", 86, 124, 16, 2);
  // opening to the beach
  poly(g, "#40235a", [[300, 120], [296, 70], [306, 44], [320, 40], [320, 120]]);
  vgrad(g, 304, 46, 16, 30, ["#2c1a4f", "#4c255d", "#7a3560"]);
  // rock pedestal
  poly(g, "#352a48", [[218, 120], [224, 102], [262, 98], [276, 104], [280, 120]]);
  px(g, "#45385a", 226, 100, 34, 2);
}

const PAINTERS = { beach: paintBeach, village: paintVillage, cliff: paintCliff, tower: paintTower, lamp: paintLamp, cave: paintCave };

// ------------------------------------------------------------------ characters + items

const MOSS_PAL = { O: "#d98c4f", o: "#8c4a2a", p: "#f2c08a", r: "#d8442e", d: "#8e2418", W: "#ffffff", K: "#000000", N: "#2a3d66", n: "#1b2844" };
const MOSS = [
  "..............NNNN..",
  ".............NNNNNN.",
  "....oooo....nnnnnnnn",
  "...oOOOOo....W...W..",
  "..oOpppOOo...K...K..",
  ".oOpOOOpOOo..d...d..",
  ".oOpOpOpOOo.rrrrrr..",
  "oOOpOppOOOorrrrrrrr.",
  "oOOOpOOOOOorrKrrrrrd",
  "oOOOOOOOOOorrrrrrrdd",
  ".oOOOOOOOo.rrrrrr.d.",
  "..oooooooo.r.r..r...",
  "...........r.r..r...",
];

const PIP_PAL = { W: "#f4f1e8", w: "#c8c4bc", g: "#8f97aa", G: "#6a7184", K: "#000000", Y: "#f0a030", R: "#aa0a19", r: "#7a0812" };
const PIP = [
  ".....RRRR.....",
  "....RRRRRR....",
  "...rrrrrrrr...",
  "....WWWWWW....",
  "...WKWWWWWW...",
  "YYYWWWWWWWW...",
  ".YYWWWWWWWWW..",
  "...WWWWWWgggg.",
  "...WWWWWggggGG",
  "...wWWWWWgggGG",
  "....wWWWWWgg..",
  ".....wwwwww...",
  "......Y..Y....",
  ".....YY.YY....",
];

const ITEM_PAL = {
  t: "#c8a165", u: "#8a6a3a", n: "#8fb38a", h: "#6a4428", k: "#b06a3a", l: "#e0a070",
  f: "#c0d0e0", F: "#7088a0", K: "#000000", j: "#8a5e3a", J: "#b08058", y: "#e8c040",
  m: "#6a6e7e", M: "#9a9eae", g: "#2e3a4a", G: "#ffd25a", c: "#2de2ff", C: "#c8fbff", b: "#c9a227",
};
const ITEM_ART = {
  rope: ["..tttttt..", ".tuuuuuut.", "tu.tttt.ut", "tu.u..u.ut", "tu.u.tu.ut", "tu.uuuu.ut", "tu......ut", ".tuuuuuut.", "..tttttt..", ".......tt."],
  net: ["nnnnnnnn..", "n.n.n.nn..", "nnnnnnnn..", "n.n.n.nn..", "nnnnnnnn..", ".n.n.nn...", "..nnnnhh..", "......hh..", ".......hh.", "........hh"],
  key: ["..kkkk....", ".k....k...", ".k....k...", ".k....k...", "..kkkk....", "...kk.....", "...kkll...", "...kk.....", "...kkll...", "...kk....."],
  fish: ["..........", "..........", "...ffff..F", ".fffffffFF", "fKffffffFF", "fffffffFFF", ".ffffff..F", "...FFF....", "..........", ".........."],
  oil: ["...JJJ....", "...jjj....", "..jjjjj...", ".jjjjjjjjj", "jjyyyyyj.j", "jjyyyyyj.j", "jjyyyyyjj.", "jjjjjjjj..", ".jjjjjjj..", "..jjjjj..."],
  lantern: ["....MM....", "...M..M...", "..mmmmmm..", "..mggggm..", "..mggggm..", "..mggggm..", "..mggggm..", "..mmmmmm..", "...mmmm...", ".........."],
  lantern_lit: ["....MM....", "...M..M...", "..mmmmmm..", "..mGGGGm..", "..mGyyGm..", "..mGyyGm..", "..mGGGGm..", "..mmmmmm..", "...mmmm...", ".........."],
  lens: ["...bbbb...", "..bccccb..", ".bcCCcccb.", ".bcCccccb.", ".bccccccb.", ".bcccccCb.", ".bccccCcb.", "..bccccb..", "...bbbb...", ".........."],
};

function loadArt() {
  const items = {};
  for (const k in ITEM_ART) items[k] = sprite(ITEM_ART[k], ITEM_PAL);
  const bgs = {};
  for (const k in PAINTERS) {
    const cv = document.createElement("canvas");
    cv.width = SW; cv.height = SH;
    PAINTERS[k](cv.getContext("2d"));
    bgs[k] = cv;
  }
  return {
    bgs, items,
    cuetipR: gridToCanvas(CUETIP), cuetipL: gridToCanvas(mirror(CUETIP)),
    moss: sprite(MOSS, MOSS_PAL), pip: sprite(PIP, PIP_PAL),
    shadow: SHADOW.map((s) => gridToCanvas(s)),
  };
}
