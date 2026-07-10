// Generalizes the old drawForestMaterialIcon() precedent (render.js), which
// hand-drew a distinct silhouette for the 3 forest materials that had no
// sprite-sheet art, into a shared icon set covering every currently
// un-sprited material/item in the game (~22 materials plus refined goods,
// artifacts, and Pod-spell fruit names). Two entry points:
//   drawMaterialIcon(ctx, name, px, py) — draws directly into a 32x32 tile
//     on a live canvas (used by render.js for in-world resource nodes).
//   getMaterialIconDataUrl(name) — renders the same icon to a small offscreen
//     canvas once, caches it, and returns a data: URL (used by Hud.jsx as a
//     CSS background-image, replacing the old flat hashColor() swatch).
// This is the immediate code-level stopgap described in
// ASSET_GENERATION_GUIDE.md's Addendum — it ships now, with no dependency on
// externally-generated art.

const SIZE = 32;

// Stable hash, same idea as the old Hud.jsx hashColor() — used both for the
// generic fallback's color and to jitter hand-authored shapes so repeated
// icons of the same material still feel painterly rather than stamped.
function hash(name, seed = 0) {
  let h = seed >>> 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}
function hueOf(name) { return hash(name) % 360; }

// ---- reusable shape families, each parameterized by color so many
// thematically-similar materials can share a drawing routine while still
// looking distinct via color/name-seeded jitter. ----

function drawChunk(ctx, cx, cy, base, dark, name) {
  const j = (hash(name, 7) % 5) - 2;
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(cx + j, cy + 3, 10, 7, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy + 2); ctx.lineTo(cx - 4, cy - 8); ctx.lineTo(cx + 5, cy - 7);
  ctx.lineTo(cx + 9, cy + 1); ctx.lineTo(cx + 3, cy + 6); ctx.lineTo(cx - 6, cy + 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = `${dark}88`;
  for (let i = 0; i < 3; i++) {
    const sx = cx - 5 + i * 5 + ((hash(name, i * 3) % 3) - 1);
    ctx.beginPath(); ctx.arc(sx, cy - 1, 1.4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBar(ctx, cx, cy, base, shine) {
  ctx.fillStyle = base;
  ctx.fillRect(cx - 9, cy - 4, 18, 9);
  ctx.fillStyle = shine;
  ctx.fillRect(cx - 9, cy - 4, 18, 2);
  ctx.fillStyle = `${base}cc`;
  ctx.beginPath(); ctx.moveTo(cx - 9, cy + 5); ctx.lineTo(cx - 6, cy + 8); ctx.lineTo(cx + 12, cy + 8); ctx.lineTo(cx + 9, cy + 5); ctx.closePath(); ctx.fill();
}

function drawBlob(ctx, cx, cy, base, dark, name) {
  const blobs = [[-4, 2, 6], [4, -1, 5.5], [-1, -5, 4.5]];
  for (let i = 0; i < blobs.length; i++) {
    const [dx, dy, r] = blobs[i];
    const jx = ((hash(name, i * 5) % 3) - 1);
    ctx.fillStyle = i === 1 ? dark : base;
    ctx.beginPath(); ctx.ellipse(cx + dx + jx, cy + dy, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCloth(ctx, cx, cy, base, fold) {
  ctx.fillStyle = base;
  ctx.fillRect(cx - 9, cy - 7, 18, 14);
  ctx.strokeStyle = fold; ctx.lineWidth = 1.2;
  for (const dy of [-3, 1, 5]) { ctx.beginPath(); ctx.moveTo(cx - 9, cy + dy); ctx.quadraticCurveTo(cx, cy + dy + 2, cx + 9, cy + dy); ctx.stroke(); }
}

function drawCoil(ctx, cx, cy, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.4;
  for (let r = 3; r <= 9; r += 3) { ctx.beginPath(); ctx.arc(cx, cy, r, 0.3, Math.PI * 1.7); ctx.stroke(); }
}

function drawGem(ctx, cx, cy, base, light) {
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 7, cy - 1); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 7, cy - 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 7, cy - 1); ctx.lineTo(cx, cy - 1); ctx.closePath(); ctx.fill();
}

function drawDroplet(ctx, cx, cy, base, glow) {
  ctx.fillStyle = `${glow}55`;
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.quadraticCurveTo(cx + 7, cy + 2, cx, cy + 9); ctx.quadraticCurveTo(cx - 7, cy + 2, cx, cy - 8); ctx.fill();
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.ellipse(cx - 2, cy - 1, 2, 3, 0.4, 0, Math.PI * 2); ctx.fill();
}

function drawSparkleCluster(ctx, cx, cy, color, name) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + hash(name, i) * 0.001;
    const d = 5 + (hash(name, i + 10) % 4);
    const sx = cx + Math.cos(a) * d, sy = cy + Math.sin(a) * d * 0.8;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = `${color}cc`;
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
}

// Grain/Fiber/Farm Seed keep their original hand-drawn silhouette (the
// precedent this module generalizes) rather than being re-themed.
function drawStalks(ctx, cx, cy) {
  ctx.strokeStyle = "#d9b54a"; ctx.fillStyle = "#d9b54a"; ctx.lineWidth = 1.5;
  for (const dx of [-5, 0, 5]) {
    ctx.beginPath(); ctx.moveTo(cx + dx, cy + 8); ctx.quadraticCurveTo(cx + dx + 2, cy - 2, cx + dx, cy - 10); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + dx, cy - 10, 2, 4, 0.3, 0, Math.PI * 2); ctx.fill();
  }
}
function drawFiberStrands(ctx, cx, cy) {
  ctx.strokeStyle = "#8fae5c"; ctx.lineWidth = 2;
  for (const dx of [-6, -2, 2, 6]) { ctx.beginPath(); ctx.moveTo(cx + dx, cy + 9); ctx.quadraticCurveTo(cx + dx * 1.4, cy - 4, cx + dx * 0.6, cy - 12); ctx.stroke(); }
}
function drawSeedPod(ctx, cx, cy) {
  ctx.fillStyle = "#c98a4b";
  ctx.beginPath(); ctx.ellipse(cx - 5, cy, 4, 6, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 2, cy - 3, 4, 6, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 3, cy + 6, 4, 6, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8a5f2d"; ctx.fillRect(cx - 1, cy - 10, 2, 8);
}

// ---- the icon table: one entry per named material/item with real art. ----
const ICONS = {
  Clay: (ctx, cx, cy, n) => drawBlob(ctx, cx, cy, "#b57a4a", "#8a5937", n),
  Compost: (ctx, cx, cy, n) => drawBlob(ctx, cx, cy, "#5c4a30", "#3a2f1e", n),
  Grain: drawStalks,
  "Copper Ore": (ctx, cx, cy, n) => drawChunk(ctx, cx, cy, "#c07d3f", "#8a5937", n),
  Stone: (ctx, cx, cy, n) => drawChunk(ctx, cx, cy, "#8a8477", "#5c5648", n),
  Fiber: drawFiberStrands,
  "Farm Seed": drawSeedPod,
  Wax: (ctx, cx, cy) => drawDroplet(ctx, cx, cy, "#e8c86a", "#f4d35e"),
  "Iron Ingot": (ctx, cx, cy) => drawBar(ctx, cx, cy, "#9aa0a8", "#d8dee4"),
  "Iron Ingot frame": (ctx, cx, cy) => drawBar(ctx, cx, cy, "#9aa0a8", "#d8dee4"),
  Cloth: (ctx, cx, cy) => drawCloth(ctx, cx, cy, "#cbb98f", "#a5906a"),
  "Iron Ore": (ctx, cx, cy, n) => drawChunk(ctx, cx, cy, "#6d675e", "#403c34", n),
  Rope: (ctx, cx, cy) => drawCoil(ctx, cx, cy, "#a5824a"),
  Honey: (ctx, cx, cy) => drawDroplet(ctx, cx, cy, "#e6a323", "#f4d35e"),
  Essence: (ctx, cx, cy) => drawDroplet(ctx, cx, cy, "#c9a5e8", "#9fb6e0"),
  Alloy: (ctx, cx, cy) => drawBar(ctx, cx, cy, "#8a97a8", "#e0e8f0"),
  "Copper Ingot": (ctx, cx, cy) => drawBar(ctx, cx, cy, "#c07d3f", "#f0b878"),
  Confection: (ctx, cx, cy, n) => drawBlob(ctx, cx, cy, "#e8a3c0", "#d9789f", n),
  "Everbloom Pollen": (ctx, cx, cy, n) => drawSparkleCluster(ctx, cx, cy, "#f4d35e", n),
  "Crystal Shard": (ctx, cx, cy) => drawGem(ctx, cx, cy, "#6ac8d8", "#bfeef5"),
  "Skyvine Silk": (ctx, cx, cy) => drawCloth(ctx, cx, cy, "#a8d8c8", "#7ab5a0"),
  Moonspore: (ctx, cx, cy, n) => drawSparkleCluster(ctx, cx, cy, "#9fb6e0", n),
  "Everbloom Seed": (ctx, cx, cy) => drawGem(ctx, cx, cy, "#e9c14a", "#fff0b0"),
};

// Anything with no authored entry above (Pod-spell fruit names like
// "Sweetberry", artifact display names, any future item) still gets
// something distinct rather than a flat rectangle: a berry/gem shape hued
// from its own name, same determinism the old hashColor() swatch relied on.
function drawGenericFallback(ctx, cx, cy, name) {
  const hue = hueOf(name);
  drawGem(ctx, cx, cy, `hsl(${hue}, 50%, 45%)`, `hsl(${hue}, 60%, 68%)`);
}

export function drawMaterialIcon(ctx, name, px, py) {
  const cx = px + 16, cy = py + 16;
  const fn = ICONS[name];
  if (fn) fn(ctx, cx, cy, name);
  else drawGenericFallback(ctx, cx, cy, name);
}

const dataUrlCache = new Map();
export function getMaterialIconDataUrl(name) {
  if (dataUrlCache.has(name)) return dataUrlCache.get(name);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  drawMaterialIcon(ctx, name, 0, 0);
  const url = canvas.toDataURL();
  dataUrlCache.set(name, url);
  return url;
}
