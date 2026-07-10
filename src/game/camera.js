import { TILE } from "./maps.js";

// Fixed viewport (in tiles) the canvas renders at, regardless of zone size.
// Zones larger than this scroll to follow the player; zones smaller than it
// are clamped so the camera never reveals past a zone edge. Decoupling the
// canvas resolution from the whole-zone size is what lets maps.js grow beyond
// one screen without shrinking every sprite.
export const VIEW_TILES_W = 22;
export const VIEW_TILES_H = 14;
export const VIEW_W = VIEW_TILES_W * TILE; // px
export const VIEW_H = VIEW_TILES_H * TILE; // px

// Top-left world-pixel offset of the viewport. Centered on the player, then
// clamped to the zone bounds. Rounded to whole pixels so the renderer's
// nearest-neighbor sprite sampling stays stable frame to frame (a fractional
// camera offset makes pixel art shimmer, the same way a fractional player
// position does — see drawPlayer()).
// Eased camera position (module-level float state). The camera lerps toward the
// clamped target each frame instead of snapping, giving a soft "follow" feel;
// the OUTPUT is still integer-rounded so nearest-neighbor sprite sampling never
// shimmers. A large target jump (zone switch / rung teleport) snaps instead of
// panning across the whole map. cameraOffset() is also called by Game.jsx's
// click→tile mapping, but that happens at most once per click, so the extra
// ease step it introduces is imperceptible.
let _ease = null;
export function cameraOffset(engine) {
  const tiles = engine.zones[engine.zone].tiles;
  const worldW = tiles[0].length * TILE, worldH = tiles.length * TILE;
  let tx = engine.player.x - VIEW_W / 2;
  let ty = engine.player.y - VIEW_H / 2;
  tx = Math.max(0, Math.min(tx, Math.max(0, worldW - VIEW_W)));
  ty = Math.max(0, Math.min(ty, Math.max(0, worldH - VIEW_H)));
  if (!_ease) _ease = { ox: tx, oy: ty };
  if (Math.abs(tx - _ease.ox) > VIEW_W || Math.abs(ty - _ease.oy) > VIEW_H) {
    _ease.ox = tx; _ease.oy = ty; // snap on teleport/zone change
  } else {
    const k = 0.18;
    _ease.ox += (tx - _ease.ox) * k;
    _ease.oy += (ty - _ease.oy) * k;
  }
  // Screen-shake: a decaying jitter read live from the engine (kept off the
  // snapshot). Applied here so it rides on top of the eased+clamped follow.
  let sx = 0, sy = 0;
  if (engine.shake > 0.05) {
    sx = (Math.random() * 2 - 1) * engine.shake;
    sy = (Math.random() * 2 - 1) * engine.shake;
  }
  return { ox: Math.round(_ease.ox + sx), oy: Math.round(_ease.oy + sy) };
}
