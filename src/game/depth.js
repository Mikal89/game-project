// Depth foundation for the enhanced top-down 2.5D look. Pure module: no engine
// state, no snapshot involvement — imported by render.js only. It supplies (1) a
// per-zone tile-elevation table so raised terrain (border cliffs/tree lines,
// building rows) can be drawn lifted with a visible vertical face, (2) a cheap
// flat cast-shadow primitive dropped under every entity so props read as sitting
// ON the ground rather than pasted onto it, and (3) per-entity-kind shadow specs.
import { TILE } from "./maps.js";

// Per-zone, per-char elevation in world pixels. Positive lifts a tile's art up
// and exposes a vertical face of that height beneath it (the "cliff"); the value
// is intentionally modest so the flat pixel-art sprites still read cleanly. Water
// reads slightly sunken. Everything unlisted is ground level (0).
const ZONE_ELEV = {
  farm:   { "#": 14 },
  cave:   { "#": 18 },
  forest: { "#": 16 },
  town:   { "#": 20 },
};
const COMMON_ELEV = { "~": -4 };

export function elevationAt(zone, ch) {
  const z = ZONE_ELEV[zone];
  if (z && ch in z) return z[ch];
  if (ch in COMMON_ELEV) return COMMON_ELEV[ch];
  return 0;
}

// A single flat translucent ellipse under an entity's feet — the cheapest thing
// that still sells "this object is standing on the ground." Centres are rounded
// so the shadow never shimmers against the nearest-neighbor sprite sampling.
export function drawSoftShadow(ctx, cx, footY, rx, ry, alpha = 0.28) {
  ctx.save();
  ctx.fillStyle = `rgba(18,14,10,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(Math.round(cx), Math.round(footY), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Shadow footprint per entity kind (x/y radius in px + alpha). Bigger, softer
// shadows under bulkier props.
export const SHADOW_SPEC = {
  player:    { rx: 9,  ry: 4, alpha: 0.30 },
  wall:      { rx: 15, ry: 5, alpha: 0.22 },
  tree:      { rx: 14, ry: 5, alpha: 0.26 },
  rock:      { rx: 12, ry: 5, alpha: 0.30 },
  structure: { rx: 15, ry: 6, alpha: 0.28 },
  node:      { rx: 10, ry: 4, alpha: 0.24 },
  crop:      { rx: 8,  ry: 3, alpha: 0.22 },
  shop:      { rx: 14, ry: 5, alpha: 0.26 },
  notice:    { rx: 11, ry: 4, alpha: 0.26 },
};

// Face (exposed vertical side) colors for lifted/raised tiles, per zone: a dark
// base with a slightly lit top lip so the elevation catches a hint of light.
export const FACE_COLOR = { farm: "#3a2c1a", cave: "#14100c", forest: "#1b1409", town: "#4a3826" };
export const FACE_LIT   = { farm: "#5c4630", cave: "#2c2118", forest: "#2e2415", town: "#6e5638" };

export { TILE };
