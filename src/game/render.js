import { TILE, RESOURCE_NODES, MINE_ROCK, ZONE_EXITS } from "./maps.js";
import { CROPS } from "./GameEngine.js";
import { drawCell, CAVE_TILE_CELL, FARM_TILE_CELL, STRUCTURE_CELL, NODE_COLUMN, CROP_CELL, PLAYER_ROW, PLAYER_COL_XSHIFT, PLAYER_ROW_SRC_HFRAC, PLAYER_ROW_YSHIFT } from "./sprites.js";
import { drawMaterialIcon } from "./materialIcons.js";
import { cameraOffset } from "./camera.js";
import { elevationAt, drawSoftShadow, SHADOW_SPEC, FACE_COLOR, FACE_LIT } from "./depth.js";

// Flat-color fallbacks: drawn first every frame so there's never a blank
// tile while a sheet is still loading (and as a safety net if one 404s).
const FARM_COLORS = { "#": "#2c3a20", ".": "#7cab54", "~": "#4a86ad", D: "#6b4a2f", c: "#7cab54", p: "#c9b98a", s: "#7cab54", k: "#7cab54", F: "#7cab54", t: "#7cab54" };
const CAVE_COLORS = { "#": "#171310", ".": "#332a20", o: "#332a20", x: "#332a20", e: "#332a20" };
const ROLE_COLORS = { Bloom: "#d98cc0", Root: "#8a5937", Vine: "#5c8a3a", Fungus: "#8f6a92", Pod: "#c07d3f" };
// Glow tint for each catalyst, used by the final cast-burst of the planting
// ritual so the light reads as "sunlight", "moonlight", etc.
const CATALYST_GLOW = { Sunlight: "#f4d35e", Water: "#5ea8d1", Snowfall: "#eaf6fb", Darkness: "#6a4fa0", Moonlight: "#9fb6e0" };
const RITUAL_STEP_GLOW = { seed: "#6ea24a", essence: "#a35cc9", catalyst: "#e9c14a" };
const RITUAL_CAST_DURATION = 0.9;

function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

// Deterministic per-tile "noise" (0..1) — seeded by tile grid coords (not
// time), so procedural texture detail (moss speckles, cobblestones, canopy
// jitter) stays perfectly stable frame to frame instead of flickering, the
// way a real tileset's baked-in pixel variation would.
function hashTile(x, y, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2654435761;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Structures (refine station, market stall, cave entrance) render taller
// than one tile so they read as actual buildings — anchored to the bottom
// of their tile and overflowing upward, the way Stardew-style props do.
function drawOverflowSprite(ctx, sheetName, col, row, px, py, scale = 1.5) {
  const dw = TILE * scale, dh = TILE * scale;
  const dx = Math.round(px + TILE / 2 - dw / 2), dy = Math.round(py + TILE - dh);
  drawCell(ctx, sheetName, col, row, dx, dy, dw, dh);
}

function waterFrame() { return Math.floor(performance.now() / 450) % 3; }

// Zone transitions read as terrain, not UI: a plain worn-dirt gap (no post,
// no flag, no lock glyph) for the gates that are simply "another way out",
// and a separate thicket/bramble tangle (below) for the one gate that's
// genuinely blocked until the player has progressed — the block itself is
// the visual, not a padlock icon layered on top of one.
function drawPathGate(ctx, px, py) {
  ctx.fillStyle = "#8a6f47";
  ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, TILE * 0.34, TILE * 0.44, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#6d5a34";
  ctx.fillRect(px + 4, py + 5, 3, TILE - 10);
  ctx.fillRect(px + TILE - 7, py + 5, 3, TILE - 10);
}

// The Wildwood gate: a tangle of bramble blobs, dense and dark while the
// path is still overgrown (locked), thinned and brighter with a worn dirt
// thread through it once the land's ready (unlocked) — same tile, no text.
function drawThicketGate(ctx, px, py, tx, ty, cleared) {
  const blobs = [[-9, -4, 7], [6, -6, 6], [-4, 6, 6], [8, 5, 5], [0, -10, 5]];
  for (let i = 0; i < blobs.length; i++) {
    const [dx, dy, r] = blobs[i];
    const jx = (hashTile(tx, ty, i * 3 + 1) - 0.5) * 4;
    const jy = (hashTile(tx, ty, i * 3 + 2) - 0.5) * 4;
    ctx.fillStyle = cleared ? (i % 2 ? "#5c8a3a" : "#6fa347") : (i % 2 ? "#2e4a22" : "#233a1b");
    ctx.beginPath(); ctx.ellipse(px + TILE / 2 + dx + jx, py + TILE / 2 + dy + jy, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (cleared) {
    ctx.fillStyle = "#8a6f47aa";
    ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// Rubble — a collapsed dead-end (SOLID_TILES: "r") drawn straight over
// whichever floor the caller already painted, implying more world past the
// edge of what's currently open without any explanatory popup.
function drawRubble(ctx, px, py) {
  const stones = [[-9, 4, 7, 5], [3, -2, 8, 6], [-4, -7, 6, 5], [7, 8, 6, 4], [-10, -8, 5, 4]];
  for (let i = 0; i < stones.length; i++) {
    const [dx, dy, w, h] = stones[i];
    const sx = px + TILE / 2 + dx, sy = py + TILE / 2 + dy;
    // Drop shadow under each stone, then the face, then a lit top edge.
    ctx.fillStyle = "#2a2620aa";
    ctx.fillRect(sx + 1, sy + 1, w, h);
    ctx.fillStyle = i % 2 ? "#6b6459" : "#84796a";
    ctx.fillRect(sx, sy, w, h);
    ctx.fillStyle = i % 2 ? "#847d70" : "#9a8f7e";
    ctx.fillRect(sx, sy, w, 1);
    // Moss creeping over roughly half the stones.
    if (i % 2 === 0) { ctx.fillStyle = "#4f6b3a99"; ctx.fillRect(sx, sy + h - 2, w, 2); }
  }
  ctx.fillStyle = "#2c281f66";
  ctx.fillRect(px + TILE / 2 - 2, py + TILE / 2 - 10, 4, 20);
}

// Scalding steam vent (SOLID_TILES: "v") — an impassable cave hazard that
// seals off a small pocket the player can see but not reach; a physical
// boundary rather than an invisible wall. The puff animates the same
// performance.now()-driven way waterFrame() does, no extra state needed.
function drawSteamVent(ctx, px, py) {
  const cx = px + TILE / 2;
  ctx.fillStyle = "#221c18";
  ctx.beginPath(); ctx.ellipse(cx, py + TILE - 6, TILE * 0.38, TILE * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4a3a2a";
  ctx.beginPath(); ctx.ellipse(cx - 6, py + TILE - 8, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 7, py + TILE - 7, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
  const t = performance.now() / 1000;
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.6 + i / 3) % 1;
    const puffY = py + TILE - 10 - phase * TILE * 1.1;
    const puffX = cx + Math.sin((t + i) * 2.3) * 5;
    const alpha = 0.5 * (1 - phase);
    const size = 4 + phase * 8;
    ctx.fillStyle = `rgba(230,225,210,${alpha.toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(puffX, puffY, size, size * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// --- Forest zone: procedural ground (no sprite sheet yet, but no longer a
// flat rect either) — deterministic moss speckles on the floor and a
// layered canopy silhouette on the tree-line border, both seeded from the
// tile's own grid coords via hashTile so the texture is stable, not noisy.
function drawForestFloor(ctx, px, py, tx, ty) {
  // Base grass, its hue nudged per-tile so the floor mottles between a few
  // greens instead of reading as one flat slab.
  const base = hashTile(tx, ty, 11);
  rect(ctx, px, py, TILE, TILE, base > 0.66 ? "#547f40" : base > 0.33 ? "#4f7a3d" : "#496f38");
  // A soft dirt/undergrowth patch on some tiles for large-scale variety.
  if (hashTile(tx, ty, 12) > 0.72) {
    ctx.fillStyle = "#6b5a3aaa";
    const dxp = px + 3 + hashTile(tx, ty, 13) * (TILE - 12);
    const dyp = py + 3 + hashTile(tx, ty, 14) * (TILE - 12);
    ctx.beginPath(); ctx.ellipse(dxp, dyp, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Mottled undergrowth speckles.
  const n = 3 + Math.floor(hashTile(tx, ty, 1) * 3);
  for (let i = 0; i < n; i++) {
    const sx = px + 4 + hashTile(tx, ty, i * 7 + 2) * (TILE - 8);
    const sy = py + 4 + hashTile(tx, ty, i * 7 + 3) * (TILE - 8);
    ctx.fillStyle = i % 2 ? "#3f6b34" : "#5c8a49";
    ctx.beginPath(); ctx.ellipse(sx, sy, 2.4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  // A few upright grass blades catch a highlight for texture.
  ctx.strokeStyle = "#6fa04c"; ctx.lineWidth = 1;
  const blades = 2 + Math.floor(hashTile(tx, ty, 20) * 2);
  ctx.beginPath();
  for (let i = 0; i < blades; i++) {
    const bx = px + 4 + hashTile(tx, ty, i * 5 + 21) * (TILE - 8);
    const by = py + 6 + hashTile(tx, ty, i * 5 + 22) * (TILE - 10);
    ctx.moveTo(bx, by); ctx.lineTo(bx + (hashTile(tx, ty, i + 23) - 0.5) * 3, by - 4);
  }
  ctx.stroke();
  // Occasional tiny flower — a warm dot of color breaking up the green.
  if (hashTile(tx, ty, 30) > 0.85) {
    const fx = px + 5 + hashTile(tx, ty, 31) * (TILE - 10);
    const fy = py + 5 + hashTile(tx, ty, 32) * (TILE - 10);
    ctx.fillStyle = hashTile(tx, ty, 33) > 0.5 ? "#e8d05a" : "#e090b0";
    ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff2c0";
    ctx.beginPath(); ctx.arc(fx, fy, 0.7, 0, Math.PI * 2); ctx.fill();
  }
}

const CANOPY_BLOBS = [[0.3, 0.35, 10], [0.72, 0.3, 9], [0.5, 0.66, 11], [0.18, 0.72, 7], [0.82, 0.7, 8]];
function drawForestBorder(ctx, px, py, tx, ty) {
  rect(ctx, px, py, TILE, TILE, "#16261a");
  // Trunk hints — a couple of dark bark strokes peeking through the canopy give
  // the tree-line depth instead of a flat mass of leaves.
  if (hashTile(tx, ty, 40) > 0.4) {
    ctx.fillStyle = "#2c2013";
    const trx = px + TILE * (0.3 + hashTile(tx, ty, 41) * 0.4);
    ctx.fillRect(trx, py + TILE * 0.5, 3, TILE * 0.5);
    ctx.fillStyle = "#3a2c1a";
    ctx.fillRect(trx + 3, py + TILE * 0.55, 1.5, TILE * 0.45);
  }
  // Canopy blobs, back-to-front: a darker underlayer for depth, then the mid
  // green, then a few sun-catching highlight leaves on top.
  for (const [bx, by, r] of CANOPY_BLOBS) {
    const jx = (hashTile(tx, ty, r) - 0.5) * 5;
    const jy = (hashTile(tx, ty, r + 1) - 0.5) * 5;
    const cx = px + bx * TILE + jx, cy = py + by * TILE + jy;
    ctx.fillStyle = "#14251a";
    ctx.beginPath(); ctx.ellipse(cx + 1.5, cy + 1.5, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = r % 2 === 0 ? "#254d2c" : "#1e3a22";
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = r % 2 === 0 ? "#347040" : "#2c5c34";
    ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.45, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Scattered highlight leaf specks for a dappled top edge.
  ctx.fillStyle = "#3f8048";
  for (let i = 0; i < 3; i++) {
    const lx = px + 3 + hashTile(tx, ty, i * 9 + 50) * (TILE - 6);
    const ly = py + 3 + hashTile(tx, ty, i * 9 + 51) * (TILE - 6);
    ctx.beginPath(); ctx.arc(lx, ly, 1.4, 0, Math.PI * 2); ctx.fill();
  }
}

// --- Town zone: procedural plaza cobblestones + half-timber building walls,
// same "no sheet yet, but not a flat rect" treatment as the forest above.
function drawTownFloor(ctx, px, py, tx, ty) {
  // Darker mortar base shows through the seams between the cobbles.
  rect(ctx, px, py, TILE, TILE, "#9c8c66");
  const cols = 3, cw = TILE / cols;
  for (let cy = 0; cy < cols; cy++) for (let cx = 0; cx < cols; cx++) {
    const h = hashTile(tx * cols + cx, ty * cols + cy, 5);
    if (h < 0.2) continue; // a gap in the paving reveals mortar
    const x0 = px + cx * cw + 1, y0 = py + cy * cw + 1, w = cw - 2, hgt = cw - 2;
    // Ambient-occlusion shadow under each stone.
    ctx.fillStyle = "#6f6248";
    ctx.fillRect(x0 + 1, y0 + 1, w, hgt);
    // The cobble face, tinted per-stone.
    ctx.fillStyle = h > 0.7 ? "#b7a679" : h > 0.45 ? "#caba8c" : "#d8c89a";
    ctx.fillRect(x0, y0, w, hgt);
    // A lit top-left bevel edge for a rounded, worn look.
    ctx.fillStyle = "#e6d8ab";
    ctx.fillRect(x0, y0, w, 1);
    ctx.fillRect(x0, y0, 1, hgt);
  }
}

function drawTownWall(ctx, px, py, tx, ty) {
  // Plaster infill with a subtle vertical shade so the wall isn't a flat slab.
  rect(ctx, px, py, TILE, TILE, "#e8ddc4");
  ctx.fillStyle = "#00000014";
  ctx.fillRect(px, py + TILE * 0.6, TILE, TILE * 0.4); // lower-wall ambient shade
  // Dark roof-eave shadow across the top edge.
  ctx.fillStyle = "#3a2c1a";
  ctx.fillRect(px, py, TILE, 3);
  ctx.fillStyle = "#00000022";
  ctx.fillRect(px, py + 3, TILE, 2);
  // Half-timber framing: two posts, a mid rail, and a diagonal brace.
  ctx.fillStyle = "#5c4a34";
  ctx.fillRect(px + TILE * 0.15, py, TILE * 0.12, TILE);
  ctx.fillRect(px + TILE * 0.73, py, TILE * 0.12, TILE);
  ctx.fillRect(px, py + TILE * 0.42, TILE, TILE * 0.14);
  // Diagonal brace in the lower half.
  ctx.save();
  ctx.strokeStyle = "#5c4a34"; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + TILE * 0.21, py + TILE * 0.56);
  ctx.lineTo(px + TILE * 0.5, py + TILE);
  ctx.stroke();
  ctx.restore();
  // A small shuttered window on some wall tiles for life.
  if (hashTile(tx || 0, ty || 0, 60) > 0.5) {
    const wx = px + TILE * 0.38, wy = py + TILE * 0.12, ww = TILE * 0.26, wh = TILE * 0.22;
    ctx.fillStyle = "#3a2c1a"; ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
    ctx.fillStyle = "#7fa0b8"; ctx.fillRect(wx, wy, ww, wh); // glass
    ctx.fillStyle = "#c8dae6"; ctx.fillRect(wx, wy, ww * 0.45, wh * 0.45); // glint
    ctx.fillStyle = "#3a2c1a";
    ctx.fillRect(wx + ww / 2 - 0.5, wy, 1, wh); // mullion
    ctx.fillRect(wx, wy + wh / 2 - 0.5, ww, 1);
  }
}

// --- Ground pass drawers -------------------------------------------------
// Each zone's ground drawer paints ONLY the flat, walk-on layer: floor/grass,
// water, roads, tilled soil, and low flat obstacles (rubble). Every tall thing
// that should overlap the player at its feet line (border cliffs, structures,
// rocks, forage nodes, crops, shop/notice, the player itself) is collected into
// a y-sorted list and drawn afterwards by drawProp — that ordering is what gives
// the world real depth instead of a flat grid.
function drawFarmGround(ctx, ch, px, py, tiles, tx, ty) {
  if (ch === "~") { rect(ctx, px, py, TILE, TILE, "#4a86ad"); drawCell(ctx, "water", waterFrame(), 0, px, py, TILE, TILE); return; }
  if (ch === "=") { drawRoad(ctx, "farm", px, py, tx, ty, tiles); return; }
  rect(ctx, px, py, TILE, TILE, "#7cab54");
  const [gc, gr] = FARM_TILE_CELL.grass; drawCell(ctx, "farmTiles", gc, gr, px, py, TILE, TILE);
  if (ch === "D") { const [c, r] = FARM_TILE_CELL.tilled; drawCell(ctx, "farmTiles", c, r, px, py, TILE, TILE); return; }
  if (ch === "p") { const [c, r] = FARM_TILE_CELL.path; drawCell(ctx, "farmTiles", c, r, px, py, TILE, TILE); return; }
  if (ch === "r") { drawRubble(ctx, px, py); return; }
  // #, structures (c/s/k) and forage nodes (f/u/b/d/w) keep just the grass base
  // here; their tall art is drawn in the y-sorted prop pass.
}

function drawResourceIcon(ctx, ch, px, py, node, depleted) {
  const col = NODE_COLUMN[node.material];
  if (col === undefined) {
    // Materials with no sprite-sheet art yet (everything past the original 5
    // farm forage types) get a generalized procedural icon instead — see
    // materialIcons.js — and nothing at all once foraged out (matches the
    // sprite sheet's "depleted" being blank-ish).
    if (depleted) return;
    drawMaterialIcon(ctx, node.material, px, py);
    return;
  }
  const row = depleted ? 1 : 0;
  drawCell(ctx, "resourceNodes", col, row, px - 4, py - 8, TILE + 8, TILE + 8);
}

function drawCaveGround(ctx, ch, px, py, tiles, tx, ty) {
  if (ch === "=") { drawRoad(ctx, "cave", px, py, tx, ty, tiles); return; }
  rect(ctx, px, py, TILE, TILE, "#332a20");
  const [fc, fr] = CAVE_TILE_CELL.floor; drawCell(ctx, "caveTiles", fc, fr, px, py, TILE, TILE);
  if (ch === "e") { const [c, r] = CAVE_TILE_CELL.exit; drawCell(ctx, "caveTiles", c, r, px, py, TILE, TILE); }
  if (ch === "v") drawSteamVent(ctx, px, py);
  // # walls and o/x rocks are drawn in the y-sorted prop pass over this floor.
}

// Forest and town have no dedicated sprite sheets yet, but both zones now
// get real procedural texture (canopy border/moss floor, cobblestone
// plaza/timber walls — see the draw* helpers above) instead of a flat rect,
// and their return-to-farm exit gets an actual signpost like the farm side
// already has, instead of a plain translucent highlight square.
function drawForestGround(ctx, ch, px, py, tiles, tx, ty) {
  if (ch === "~") { rect(ctx, px, py, TILE, TILE, "#3a6a7a"); drawCell(ctx, "water", waterFrame(), 0, px, py, TILE, TILE); return; }
  if (ch === "=") { drawRoad(ctx, "forest", px, py, tx, ty, tiles); return; }
  drawForestFloor(ctx, px, py, tx, ty);
  // # tree-line borders and forage nodes are drawn in the y-sorted prop pass.
}

// Town shop counter ("m") — no sprite sheet yet (see Phase 5 addendum in
// ASSET_GENERATION_GUIDE.md), so a simple procedural stall reads clearly
// enough for now: a striped awning over a wooden counter.
function drawShopCounter(ctx, px, py) {
  ctx.fillStyle = "#6d4a2f";
  ctx.fillRect(px + 3, py + TILE * 0.45, TILE - 6, TILE * 0.4);
  ctx.fillStyle = "#4a3220";
  ctx.fillRect(px + 3, py + TILE * 0.45, TILE - 6, 3);
  const stripeW = (TILE - 6) / 4;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? "#b23b3b" : "#e8ddc4";
    ctx.fillRect(px + 3 + i * stripeW, py + TILE * 0.12, stripeW, TILE * 0.2);
  }
  ctx.fillStyle = "#3a2c1c";
  ctx.fillRect(px + 5, py + TILE * 0.32, 3, TILE * 0.14);
  ctx.fillRect(px + TILE - 8, py + TILE * 0.32, 3, TILE * 0.14);
  ctx.fillStyle = "#e9c14a";
  ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE * 0.68, 3, 0, Math.PI * 2); ctx.fill();
}

// Town notice board ("q") — a posted wooden board on two legs with pinned
// paper notes; the townsfolk's quest requests. Procedural for now (see the
// Phase 5 addendum in ASSET_GENERATION_GUIDE.md).
function drawNoticeBoard(ctx, px, py) {
  // legs
  ctx.fillStyle = "#5c4126";
  ctx.fillRect(px + 7, py + TILE * 0.55, 3, TILE * 0.4);
  ctx.fillRect(px + TILE - 10, py + TILE * 0.55, 3, TILE * 0.4);
  // board
  ctx.fillStyle = "#7a5836";
  ctx.fillRect(px + 4, py + TILE * 0.16, TILE - 8, TILE * 0.42);
  ctx.fillStyle = "#3a2c1c";
  ctx.strokeStyle = "#3a2c1c"; ctx.lineWidth = 1;
  ctx.strokeRect(px + 4, py + TILE * 0.16, TILE - 8, TILE * 0.42);
  // pinned paper notes
  const notes = [[0.14, 0.24, 0.22, 0.16], [0.42, 0.22, 0.2, 0.2], [0.68, 0.28, 0.18, 0.14]];
  for (let i = 0; i < notes.length; i++) {
    const [nx, ny, nw, nh] = notes[i];
    ctx.fillStyle = i % 2 ? "#efe6cf" : "#f6f0dd";
    ctx.fillRect(px + nx * TILE, py + ny * TILE, nw * TILE, nh * TILE);
    ctx.fillStyle = "#b23b3b"; // pin
    ctx.beginPath(); ctx.arc(px + (nx + nw / 2) * TILE, py + ny * TILE + 1.5, 1.2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawTownGround(ctx, ch, px, py, tiles, tx, ty) {
  if (ch === "~") {
    rect(ctx, px, py, TILE, TILE, "#4a86ad");
    drawCell(ctx, "water", waterFrame(), 0, px, py, TILE, TILE);
    ctx.strokeStyle = "#8a97a0aa"; ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
    return;
  }
  if (ch === "=") { drawRoad(ctx, "town", px, py, tx, ty, tiles); return; }
  drawTownFloor(ctx, px, py, tx, ty);
  if (ch === "r") drawRubble(ctx, px, py);
  // # building rows, shop counter (m) and notice board (q) are y-sorted props.
}

// --- Roads: a worn, slightly-sunken track connecting spawn → structures →
// edge road-mouths, replacing the old teleport gates. Per-zone tint (dirt on the
// farm/forest, worn stone in the cave, packed cobble in town). A darker rim is
// drawn only on sides that border a NON-road tile, so the road reads as a
// depression pressed into the ground (4-neighbour autotiling via `tiles`).
const ROAD_COLORS = {
  farm:   { base: "#b09a6a", light: "#c6b385", dark: "#8a7749", rim: "#6d5a34" },
  cave:   { base: "#463c33", light: "#574c41", dark: "#352c25", rim: "#231c16" },
  forest: { base: "#8f7a4f", light: "#a58e62", dark: "#6d5c39", rim: "#493b23" },
  town:   { base: "#9c8c66", light: "#b7a679", dark: "#7a6c4c", rim: "#5c5038" },
};
function isRoad(tiles, x, y) { return tiles?.[y]?.[x] === "="; }
function drawRoad(ctx, zone, px, py, tx, ty, tiles) {
  const c = ROAD_COLORS[zone] || ROAD_COLORS.farm;
  rect(ctx, px, py, TILE, TILE, c.base);
  // Deterministic pebble/scuff mottling so the track has texture, not a flat slab.
  for (let i = 0; i < 7; i++) {
    const sx = px + 3 + hashTile(tx, ty, i * 7 + 71) * (TILE - 6);
    const sy = py + 3 + hashTile(tx, ty, i * 7 + 72) * (TILE - 6);
    ctx.fillStyle = hashTile(tx, ty, i * 3 + 70) > 0.5 ? c.light : c.dark;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.fillStyle = c.rim;
  if (!isRoad(tiles, tx, ty - 1)) ctx.fillRect(px, py, TILE, 2);
  if (!isRoad(tiles, tx, ty + 1)) ctx.fillRect(px, py + TILE - 2, TILE, 2);
  if (!isRoad(tiles, tx - 1, ty)) ctx.fillRect(px, py, 2, TILE);
  if (!isRoad(tiles, tx + 1, ty)) ctx.fillRect(px + TILE - 2, py, 2, TILE);
}

// A raised border tile (cliff / tree-line / building row): fill the exposed
// vertical face beneath the lifted top, then draw the zone's wall art shifted up
// by its elevation. Sorted by its base line so it correctly overlaps whatever
// stands south of it and is overlapped by the player when they stand north.
function drawWallTop(ctx, zone, px, py, tx, ty) {
  if (zone === "farm") { const [c, r] = FARM_TILE_CELL.border; if (!drawCell(ctx, "farmTiles", c, r, px, py, TILE, TILE)) rect(ctx, px, py, TILE, TILE, "#2c3a20"); }
  else if (zone === "cave") { const [c, r] = CAVE_TILE_CELL.wall; if (!drawCell(ctx, "caveTiles", c, r, px, py, TILE, TILE)) rect(ctx, px, py, TILE, TILE, "#171310"); }
  else if (zone === "forest") drawForestBorder(ctx, px, py, tx, ty);
  else drawTownWall(ctx, px, py, tx, ty);
}
function drawWallProp(ctx, zone, px, py, tx, ty) {
  const E = Math.round(elevationAt(zone, "#"));
  ctx.fillStyle = FACE_COLOR[zone] || "#2a2018";
  ctx.fillRect(px, py + TILE - E, TILE, E);
  ctx.fillStyle = FACE_LIT[zone] || "#4a3a28";
  ctx.fillRect(px, py + TILE - E, TILE, 2);
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(px, py + TILE - 2, TILE, 2);
  ctx.save();
  ctx.translate(0, -E);
  drawWallTop(ctx, zone, px, py, tx, ty);
  ctx.restore();
}

// Where a prop's cast shadow sits, as a fraction of TILE below the tile's top
// (py). A shadow has to land on the sprite's *visible* ground-contact point, not
// the tile's geometric floor — otherwise the art hovers above a shadow pinned
// too low and reads as "floating". Most props' art fills to ~the tile floor, but
// forage-node plants sit high in their cell, so their contact point is well
// above the bottom edge. Anything not listed defaults to the tile floor.
const SHADOW_FOOT = { node: 0.80 };

// Draws one y-sorted tall prop (plus its soft cast shadow) at its tile. `item`
// carries the tile char/coords and any per-kind payload gathered in draw().
function drawProp(ctx, item, engine, tiles) {
  const { kind, ch, px, py, tx, ty } = item;
  const zone = engine.zone;
  if (kind === "player") {
    const s = SHADOW_SPEC.player;
    // The player sheet's feet land at ~90% of the cell height (see sprites.js
    // PLAYER_ROW_* notes), which resolves to ~py + 0.15*TILE on screen — the
    // shadow must sit there, not at py + 0.30*TILE, or the character floats.
    drawSoftShadow(ctx, engine.player.x, engine.player.y + TILE * 0.15, s.rx, s.ry, s.alpha);
    drawPlayer(ctx, engine.player);
    return;
  }
  if (kind !== "wall") {
    const s = SHADOW_SPEC[kind] || SHADOW_SPEC.node;
    const footY = kind in SHADOW_FOOT ? py + TILE * SHADOW_FOOT[kind] : py + TILE - 3;
    drawSoftShadow(ctx, px + TILE / 2, footY, s.rx, s.ry, s.alpha);
  }
  switch (kind) {
    case "wall": drawWallProp(ctx, zone, px, py, tx, ty); break;
    case "structure":
      if (ch === "c") drawOverflowSprite(ctx, "structures", STRUCTURE_CELL.caveEntrance[0], STRUCTURE_CELL.caveEntrance[1], px, py, 1.3);
      else if (ch === "s") drawOverflowSprite(ctx, "structures", STRUCTURE_CELL.refine[0], STRUCTURE_CELL.refine[1], px, py, 1.4);
      else drawOverflowSprite(ctx, "structures", STRUCTURE_CELL.market[0], STRUCTURE_CELL.market[1], px, py, 1.4);
      break;
    case "rock": {
      const rock = MINE_ROCK[ch];
      const hp = engine.rockHp.get(`${tx},${ty}`) ?? rock.hp;
      drawRock(ctx, ch, px, py, hp, rock.hp);
      break;
    }
    case "node": drawResourceIcon(ctx, ch, px, py, RESOURCE_NODES[ch], item.depleted); break;
    case "crop": drawPlot(ctx, item.plot, px, py, engine.day); break;
    case "shop": drawShopCounter(ctx, px, py); break;
    case "notice": drawNoticeBoard(ctx, px, py); break;
    case "bin": drawBin(ctx, px, py, engine); break;
  }
}

// The shipping bin: a wooden crate with an open lid.
function drawBin(ctx, px, py, engine) {
  const x = px + 5, y = py + 6, w = TILE - 10, h = TILE - 10;
  ctx.save();
  ctx.fillStyle = "#7a5230";
  ctx.fillRect(x, y + 4, w, h - 4);
  ctx.fillStyle = "#8f6338";
  ctx.fillRect(x, y + 4, w, 5);
  ctx.strokeStyle = "#4e3620";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y + 4, w, h - 4);
  // open lid tilted back
  ctx.fillStyle = "#6b4726";
  ctx.beginPath();
  ctx.moveTo(x - 2, y + 4);
  ctx.lineTo(x + w + 2, y + 4);
  ctx.lineTo(x + w - 3, y - 3);
  ctx.lineTo(x + 1, y - 3);
  ctx.closePath();
  ctx.fill();
  const count = Object.values(engine.shippingBin || {}).reduce((a, b) => a + b, 0);
  if (count > 0) {
    ctx.fillStyle = "#e7c46a";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(count), px + TILE / 2, y + 2);
  }
  ctx.restore();
}

function drawRock(ctx, ch, px, py, hp, maxHp) {
  const sheet = ch === "x" ? "rockOre" : "rockStone";
  const damage = Math.min(3, maxHp - hp);
  const col = damage % 2, row = damage < 2 ? 0 : 1;
  drawCell(ctx, sheet, col, row, px - 6, py - 10, TILE + 12, TILE + 12);
}

function drawPlot(ctx, plot, px, py, day) {
  if (!plot?.crop) return;
  const role = CROPS[plot.crop]?.essenceRole ?? "Bloom";
  const dw = TILE + 6, dh = TILE + 10;
  const dx = px + TILE / 2 - dw / 2, dy = py + TILE - dh + 4;
  if (plot.ready) {
    const [c, r] = CROP_CELL.mature[role];
    if (!drawCell(ctx, "crops", c, r, dx, dy, dw, dh)) {
      // fallback while crop sheet loads: small role-colored bud
      const cx = px + TILE / 2, cy = py + TILE / 2;
      ctx.fillStyle = ROLE_COLORS[role];
      ctx.beginPath(); ctx.arc(cx, cy - 2, 8, 0, Math.PI * 2); ctx.fill();
    }
    if (plot.mutated) {
      // a mutated crop gets a small sparkle marker
      ctx.fillStyle = "#ffe98a";
      ctx.beginPath(); ctx.arc(px + TILE - 8, py + 8, 3, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  const total = plot.matureDay - plot.plantDay;
  const done = Math.min(1, Math.max(0, (day - plot.plantDay) / Math.max(1, total)));
  const [c, r] = done < 0.5 ? CROP_CELL.seedling : CROP_CELL.midgrowth;
  drawCell(ctx, "crops", c, r, dx, dy, dw, dh);
}

function drawPlayer(ctx, player) {
  const px = player.x, py = player.y;
  const facing = player.facing === "right" ? "left" : player.facing;
  const mirror = player.facing === "right";
  const row = PLAYER_ROW[facing] ?? PLAYER_ROW.down;
  const frame = player.moving ? player.animFrame : 0;
  const size = TILE * 1.5;
  // Player x/y are continuous floats (it moves at a constant px/s speed), but
  // the sprite sheet is drawn with imageSmoothingEnabled=false and the canvas
  // is then scaled to a non-integer CSS width. Drawing at a fractional pixel
  // offset makes the browser's nearest-neighbor sampling snap differently
  // frame to frame, which reads as a side-to-side "shimmer" while walking —
  // separate from (and in addition to) the sheet's own frame-centering issue
  // fixed above. Rounding to a whole canvas pixel before drawing removes that.
  const dx = Math.round(px - size / 2), dy = Math.round(py - size + TILE * 0.3);
  const drew = drawCell(ctx, "player", frame, row, dx, dy, size, size, mirror, PLAYER_COL_XSHIFT[frame], PLAYER_ROW_SRC_HFRAC[row] ?? 1, PLAYER_ROW_YSHIFT[row] ?? 0);
  if (drew) return;
  // fallback while player sheet loads: the original vector figure
  const bob = player.moving && player.animFrame ? 2 : 0;
  ctx.fillStyle = "#2a2018";
  ctx.beginPath(); ctx.ellipse(px, py + 14, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  rect(ctx, px - 5, py + 2 - bob, 4, 10, "#4a3220");
  rect(ctx, px + 1, py + 2 + bob, 4, 10, "#4a3220");
  rect(ctx, px - 8, py - 10, 16, 16, "#3c6b8a");
  ctx.fillStyle = "#e8c088";
  ctx.beginPath(); ctx.arc(px, py - 16, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4a3220";
  ctx.beginPath(); ctx.arc(px, py - 21, 8, Math.PI, 0); ctx.fill();
}

// Planting has no menu chrome on the canvas — instead the plot glows for
// each direct action (seed planted / essence sprayed, in that step's
// color), then bursts in the released catalyst's light with role-colored
// sparkles once all three are set and it resolves, finally leaving a brief
// fading glow to mark success/failure before the next frame clears it. See
// GameEngine.js: plotEffect (a purely cosmetic echo — it never blocks input).
function drawRitualEffect(ctx, engine) {
  const r = engine.plotEffect;
  if (!r) return;
  const px = r.target.x * TILE + TILE / 2, py = r.target.y * TILE + TILE / 2;
  const t = r.effectTime;

  ctx.save();
  if (r.step === "seed" || r.step === "essence" || r.step === "catalyst") {
    const color = RITUAL_STEP_GLOW[r.step];
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const radius = TILE * (0.55 + 0.25 * pulse);
    const grad = ctx.createRadialGradient(px, py, 2, px, py, radius);
    grad.addColorStop(0, `${color}cc`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();

    // a slow-orbiting mote so the step reads as "gathering" rather than static
    const angle = t * 2.2, orbit = TILE * 0.5;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px + Math.cos(angle) * orbit, py + Math.sin(angle) * orbit * 0.6 - 4, 3, 0, Math.PI * 2); ctx.fill();
  } else if (r.step === "cast") {
    const color = CATALYST_GLOW[r.catalyst] ?? "#e9c14a";
    const progress = Math.min(1, t / RITUAL_CAST_DURATION);
    const alpha = 1 - progress;
    const radius = TILE * (0.4 + progress * 1.4);

    ctx.globalAlpha = Math.max(0, alpha);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // role-colored sparkles bursting outward from the plot
    const roleColor = ROLE_COLORS[r.role] ?? "#fff4cc";
    ctx.fillStyle = roleColor;
    const sparkCount = 8;
    for (let i = 0; i < sparkCount; i++) {
      const a = (i / sparkCount) * Math.PI * 2 + t * 1.5;
      const dist = TILE * 0.3 + progress * TILE * 1.1;
      const sx = px + Math.cos(a) * dist, sy = py + Math.sin(a) * dist * 0.7 - progress * 10;
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // a light beam for the sky-facing catalysts
    if (r.catalyst === "Sunlight" || r.catalyst === "Moonlight") {
      ctx.globalAlpha = alpha;
      const beam = ctx.createLinearGradient(px, py - TILE * 3, px, py);
      beam.addColorStop(0, `${color}00`);
      beam.addColorStop(1, `${color}88`);
      ctx.fillStyle = beam;
      ctx.fillRect(px - TILE * 0.18, py - TILE * 3, TILE * 0.36, TILE * 3);
      ctx.globalAlpha = 1;
    }
  } else if (r.step === "result") {
    const success = r.outcome?.type === "success";
    const color = success ? (ROLE_COLORS[r.role] ?? "#8fd08f") : "#8a8a8a";
    const progress = Math.min(1, t / 1.6);
    const radius = TILE * (success ? 0.7 : 0.5);

    ctx.globalAlpha = Math.max(0, (1 - progress) * 0.7);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// The Withering — a blighted farm tile: a dark violet stain over the ground
// with slow-rising sickly motes, so it reads as creeping corruption rather
// than decoration. Drawn over whatever ground tile the loop already painted.
function drawBlight(ctx, px, py, tx, ty) {
  ctx.save();
  // stain
  const grad = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 2, px + TILE / 2, py + TILE / 2, TILE * 0.6);
  grad.addColorStop(0, "#3a1046cc");
  grad.addColorStop(1, "#20082e66");
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, TILE, TILE);
  // cracked veins
  ctx.strokeStyle = "#5a1e6e"; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = hashTile(tx, ty, i * 5 + 1) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(px + TILE / 2, py + TILE / 2);
    ctx.lineTo(px + TILE / 2 + Math.cos(a) * TILE * 0.4, py + TILE / 2 + Math.sin(a) * TILE * 0.4);
    ctx.stroke();
  }
  // rising motes
  const t = performance.now() / 1000;
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.5 + hashTile(tx, ty, i * 3 + 2)) % 1;
    const mx = px + 6 + hashTile(tx, ty, i * 3 + 3) * (TILE - 12);
    const my = py + TILE - phase * TILE;
    ctx.fillStyle = `rgba(178,120,200,${(0.6 * (1 - phase)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Floating "+N" text and particle bursts (engine.effects) — drawn in world
// space so they scroll with the camera; each fades out over its lifetime.
function drawEffects(ctx, engine) {
  const fx = engine.effects;
  if (!fx?.length) return;
  ctx.save();
  ctx.textAlign = "center";
  for (const e of fx) {
    const alpha = Math.max(0, 1 - e.life / e.maxLife);
    ctx.globalAlpha = alpha;
    if (e.kind === "text") {
      ctx.font = '600 12px "Pixelify Sans", monospace';
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText(e.text, e.x + 1, e.y + 1);
      ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y);
    } else if (e.kind === "spark") {
      // Bright additive streak trailing along its velocity — reads as a spark.
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = e.color; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x - e.vx * 0.03, e.y - e.vy * 0.03);
      ctx.stroke();
      ctx.globalCompositeOperation = prevOp;
    } else if (e.kind === "dust") {
      // Soft, growing grey puff that fades — footstep kick-up.
      ctx.fillStyle = e.color;
      const r = 1.5 + (e.life / e.maxLife) * 3.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// A very subtle full-viewport wash tinting the world by season — a low-alpha
// day/night-style mood layer (warm summer, cool winter) drawn in screen space
// over the finished frame. Kept faint so sprites stay readable.
const SEASON_TINT = {
  Spring: "rgba(120,200,120,0.06)",
  Summer: "rgba(255,210,90,0.07)",
  Autumn: "rgba(200,130,60,0.09)",
  Winter: "rgba(140,175,225,0.11)",
};
// [top-of-frame, bottom-of-frame] season grade — a gentle vertical gradient
// (see drawSeasonGrade) that replaces the flat SEASON_TINT wash.
const SEASON_GRADE = {
  Spring: ["rgba(150,215,150,0.07)", "rgba(110,180,120,0.05)"],
  Summer: ["rgba(255,224,120,0.09)", "rgba(255,196,80,0.05)"],
  Autumn: ["rgba(216,150,70,0.11)", "rgba(170,100,50,0.07)"],
  Winter: ["rgba(160,190,235,0.13)", "rgba(120,150,205,0.09)"],
};

const ZONE_GROUND_DRAWERS = { farm: drawFarmGround, cave: drawCaveGround, forest: drawForestGround, town: drawTownGround };

// Which tile chars are "tall props" that must be y-sorted (so they overlap the
// player at the feet line) rather than painted flat in the ground pass.
const STRUCTURE_CHARS = new Set(["c", "s", "k"]);

// ---------------------------------------------------------------------------
// Atmosphere post-pass — a screen-space layer painted AFTER the world camera
// transform is popped, so it covers the fixed viewport uniformly (never scrolls
// or gets culled). Everything here reads the live engine (zone/season/weather)
// or performance.now(); no engine mutation, no snapshot involvement. All the
// CanvasGradients are built once and memoized — rebuilding a gradient every
// frame is the classic canvas perf trap, so we never do.
const _gradCache = new Map();
function cachedGrad(key, build) {
  let g = _gradCache.get(key);
  if (!g) { g = build(); _gradCache.set(key, g); }
  return g;
}

// Per-zone mood grade: a full-viewport wash that unifies the tileset into a
// consistent lighting key — a cool, dim cave; a warm town plaza; a green,
// shaded wildwood; a bright, neutral farm. Kept subtle so sprites stay legible.
const ZONE_GRADE = {
  cave:   { mode: "multiply", build: () => ({ flat: "rgba(40,54,78,0.42)", top: "rgba(20,26,44,0.30)" }) },
  town:   { mode: "source-over", build: () => ({ flat: "rgba(255,206,120,0.10)", top: "rgba(255,180,90,0.06)" }) },
  forest: { mode: "source-over", build: () => ({ flat: "rgba(60,120,60,0.12)", top: "rgba(20,50,25,0.14)" }) },
  farm:   { mode: "source-over", build: () => ({ flat: "rgba(255,244,210,0.05)", top: "rgba(120,160,120,0.04)" }) },
};
function drawZoneGrade(ctx, engine, w, h) {
  const spec = ZONE_GRADE[engine.zone];
  if (!spec) return;
  const key = `zonev:${engine.zone}:${w}x${h}`;
  const grad = cachedGrad(key, () => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const c = spec.build(w, h);
    g.addColorStop(0, c.top);
    g.addColorStop(0.55, c.flat);
    g.addColorStop(1, c.top);
    return g;
  });
  ctx.save();
  ctx.globalCompositeOperation = spec.mode;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Soft edge vignette — one cached radial gradient darkening the corners, the
// cheap trick that makes a flat canvas read as a framed scene.
function drawVignette(ctx, w, h) {
  const grad = cachedGrad(`vig:${w}x${h}`, () => {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.72, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(8,10,14,0.42)");
    return g;
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// Weather visuals, all driven purely by performance.now() (same deterministic,
// stateless approach as waterFrame()/drawSteamVent) so there's nothing to sync
// through the snapshot. Rain = slanted streaks + cool wash; Drought = warm haze
// + drifting dust; Clear = faint diagonal god-ray bands for a sunny mood.
const RAIN_N = 48, DUST_N = 22;
function drawWeatherFx(ctx, engine, w, h) {
  const weather = engine.weather;
  const t = performance.now() / 1000;
  if (weather === "Rain") {
    ctx.save();
    ctx.fillStyle = cachedGrad(`rainwash:${w}x${h}`, () => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(90,130,165,0.16)");
      g.addColorStop(1, "rgba(60,95,130,0.10)");
      return g;
    });
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(200,222,240,0.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < RAIN_N; i++) {
      const seed = i * 47.3;
      const x = ((seed * 13.7) % w + (t * 60) * ((i % 3) + 2)) % (w + 40) - 20;
      const speed = 620 + (i % 5) * 90;
      const y = ((seed * 91.1 + t * speed) % (h + 30)) - 15;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 13);
    }
    ctx.stroke();
    ctx.restore();
  } else if (weather === "Drought") {
    ctx.save();
    ctx.fillStyle = cachedGrad(`droughthaze:${w}x${h}`, () => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(240,196,90,0.12)");
      g.addColorStop(1, "rgba(200,150,60,0.06)");
      return g;
    });
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < DUST_N; i++) {
      const seed = i * 29.7;
      const x = (seed * 53.1 + t * (12 + (i % 4) * 6)) % (w + 20) - 10;
      const y = (seed * 71.3 + Math.sin(t * 0.5 + i) * 10) % h;
      const a = 0.10 + 0.08 * ((i % 3) / 2);
      ctx.fillStyle = `rgba(235,215,170,${a.toFixed(2)})`;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
  } else {
    // Clear: barely-there god rays — a couple of soft diagonal bands.
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = cachedGrad(`rays:${w}x${h}`, () => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "rgba(255,244,200,0.06)");
      g.addColorStop(0.5, "rgba(255,244,200,0)");
      g.addColorStop(1, "rgba(255,244,200,0.04)");
      return g;
    });
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// Season color-grade — a richer version of the old flat SEASON_TINT wash, now a
// vertical gradient so the horizon and foreground read slightly differently.
function drawSeasonGrade(ctx, engine, w, h) {
  const s = SEASON_GRADE[engine.season];
  if (!s) return;
  const grad = cachedGrad(`season:${engine.season}:${w}x${h}`, () => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, s[0]);
    g.addColorStop(1, s[1]);
    return g;
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// The farm's Wildwood road-mouth shows a bramble tangle while it's still rung-2
// locked (the block itself is the visual — no padlock glyph). Precomputed once.
const _brambleExit = ZONE_EXITS.farm.find(e => e.minRung);

export function draw(ctx, engine, width, height) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  const zone = engine.zone;
  const tiles = engine.zones[zone].tiles;
  const drawGround = ZONE_GROUND_DRAWERS[zone];

  // Camera: translate the whole world by the viewport offset once, so every
  // world-space drawCell(px = x*TILE, …) call renders unchanged; then cull to
  // the visible tile band. The TOP margin is larger (MAX_PROP_TILES) because
  // lifted cliffs and overflow structures reach up to ~2 tiles above their own
  // tile and must not be clipped as they scroll in from the top edge.
  const MAX_PROP_TILES = 2;
  const { ox, oy } = cameraOffset(engine);
  ctx.save();
  ctx.translate(-ox, -oy);
  const x0 = Math.max(0, Math.floor(ox / TILE) - 1);
  const y0 = Math.max(0, Math.floor(oy / TILE) - MAX_PROP_TILES);
  const x1 = Math.min(tiles[0].length, Math.ceil((ox + width) / TILE) + 1);
  const y1 = Math.min(tiles.length, Math.ceil((oy + height) / TILE) + 1);

  // Pass 1 — GROUND: flat, walk-on layer in plain grid order (floor/water/road/
  // tilled/rubble + blight stain), and collect every tall prop for the sorted
  // pass. Bramble on the locked Wildwood mouth is a flat ground overlay.
  const tall = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const ch = tiles[y]?.[x];
      if (ch === undefined) continue;
      const px = x * TILE, py = y * TILE;
      drawGround(ctx, ch, px, py, tiles, x, y);
      if (zone === "farm" && engine.blight?.has(`${x},${y}`)) drawBlight(ctx, px, py, x, y);
      if (zone === "farm" && _brambleExit && _brambleExit.mouth.x === x && _brambleExit.mouth.y === y && engine.maxRungUnlocked < _brambleExit.minRung) {
        drawThicketGate(ctx, px, py, x, y, false);
      }

      const base = (y + 1) * TILE; // feet baseline used as the sort key
      if (ch === "#") tall.push({ kind: "wall", ch, px, py, tx: x, ty: y, sortY: base });
      else if (zone === "farm" && STRUCTURE_CHARS.has(ch)) tall.push({ kind: "structure", ch, px, py, tx: x, ty: y, sortY: base });
      else if (zone === "town" && ch === "m") tall.push({ kind: "shop", ch, px, py, tx: x, ty: y, sortY: base });
      else if (zone === "town" && ch === "q") tall.push({ kind: "notice", ch, px, py, tx: x, ty: y, sortY: base });
      else if (zone === "farm" && ch === "B") tall.push({ kind: "bin", ch, px, py, tx: x, ty: y, sortY: base });
      if (zone === "cave" && MINE_ROCK[ch]) tall.push({ kind: "rock", ch, px, py, tx: x, ty: y, sortY: base });
      if (zone === "farm" && ch === "D") {
        const plot = engine.zones.farm.plots.get(`${x},${y}`);
        if (plot?.crop) tall.push({ kind: "crop", ch, px, py, tx: x, ty: y, plot, sortY: base });
      }
      // A foraged-out node is gone from the world until it randomly regrows —
      // don't draw it (or its shadow) at all; the grass beneath shows through.
      if ((zone === "farm" || zone === "forest") && RESOURCE_NODES[ch] && !engine.nodeRespawn.has(`${zone},${x},${y}`)) {
        tall.push({ kind: "node", ch, px, py, tx: x, ty: y, depleted: false, sortY: base });
      }
    }
  }

  // Ritual glow sits on the ground plane, beneath the sorted props/player.
  drawRitualEffect(ctx, engine);

  // Pass 2 — TALL, y-sorted: the player joins the same list, so a tree/wall/
  // structure correctly draws in front of the player when the player stands
  // north of it, and behind when south. Sub-pixel sortY (player.y) is kept
  // unrounded so ordering never z-fights; the sprites themselves round.
  tall.push({ kind: "player", sortY: engine.player.y });
  tall.sort((a, b) => a.sortY - b.sortY);
  for (const item of tall) drawProp(ctx, item, engine, tiles);

  // Cosmetic floaters/particles live in world space so they scroll with the
  // camera (they're spawned at world-pixel coords by the engine's effect helpers).
  drawEffects(ctx, engine);
  ctx.restore();

  // Atmosphere post-pass (screen space, after the world transform is popped so
  // it covers the fixed viewport uniformly): per-zone mood grade → weather FX →
  // season grade → edge vignette. Order matters — grade/weather color the scene,
  // the vignette frames it last on top.
  drawZoneGrade(ctx, engine, width, height);
  drawWeatherFx(ctx, engine, width, height);
  drawSeasonGrade(ctx, engine, width, height);
  drawVignette(ctx, width, height);
}
