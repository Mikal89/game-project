// Sprite atlas: loads the AI-generated pixel art sheets from
// src/game/assets/ and exposes small helpers for drawing a single cell out
// of a sheet (each sheet is a grid of same-size cells). Falls back silently
// (draws nothing) until an image finishes loading — render.js keeps the old
// flat-color fill underneath every tile so there's never a blank frame.

import rockStoneUrl from "./assets/sheet_rock_stone.png";
import rockOreUrl from "./assets/sheet_rock_ore.png";
import caveTilesUrl from "./assets/sheet_cave_tiles.png";
import waterUrl from "./assets/sheet_water.png";
import playerUrl from "./assets/sheet_player.png";
import farmTilesUrl from "./assets/sheet_farm_tiles.png";
import structuresUrl from "./assets/sheet_structures.png";
import resourceNodesUrl from "./assets/sheet_resource_nodes.png";
import cropsUrl from "./assets/sheet_crops.png";

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

// Each sheet is described as { img, cols, rows } — cell size is derived
// from the loaded image's natural dimensions divided by the grid, so we
// never have to hardcode brittle pixel offsets.
export const sheets = {
  rockStone: { img: loadImage(rockStoneUrl), cols: 2, rows: 2 },
  rockOre: { img: loadImage(rockOreUrl), cols: 2, rows: 2 },
  caveTiles: { img: loadImage(caveTilesUrl), cols: 3, rows: 1 },
  water: { img: loadImage(waterUrl), cols: 3, rows: 1 },
  player: { img: loadImage(playerUrl), cols: 2, rows: 4 },
  farmTiles: { img: loadImage(farmTilesUrl), cols: 2, rows: 2 },
  structures: { img: loadImage(structuresUrl), cols: 3, rows: 1 },
  resourceNodes: { img: loadImage(resourceNodesUrl), cols: 5, rows: 2 },
  crops: { img: loadImage(cropsUrl), cols: 4, rows: 2 },
};

// Named cell lookups so calling code never juggles raw col/row numbers.
export const CAVE_TILE_CELL = { floor: [0, 0], wall: [1, 0], exit: [2, 0] };
export const FARM_TILE_CELL = { grass: [0, 0], border: [1, 0], tilled: [0, 1], path: [1, 1] };
export const STRUCTURE_CELL = { refine: [0, 0], market: [1, 0], caveEntrance: [2, 0] };
// column order in sheet_resource_nodes.png: petals, spores, seed(berry), rootlets(clay), reed
export const NODE_COLUMN = { Petals: 0, "Wild Spores": 1, "Wild Seed": 2, "Claybound Rootlets": 3, Reed: 4 };
export const CROP_CELL = {
  seedling: [0, 0],
  midgrowth: [1, 0],
  mature: {
    Bloom: [2, 0],
    Root: [3, 0],
    Vine: [0, 1],
    Fungus: [1, 1],
    Pod: [2, 1],
  },
};
// player sheet rows: 0=down, 1=up, 2=left (right is this row mirrored)
export const PLAYER_ROW = { down: 0, up: 1, left: 2, right: 2 };

// The AI-generated player walk sheet wasn't drawn with the character
// centered consistently within each cell — measured directly against
// sheet_player.png, the walk-cycle's column-0 frame sits ~8% right of the
// cell's horizontal center and column-1 sits ~9% left of it, on every row.
// Since drawPlayer() alternates col 0/1 every ~150ms while moving, drawing
// each frame's cell "as-is" made the character visibly jump sideways in
// place each animation tick. This shifts the destination draw position per
// column (as a fraction of the destination width) so both frames' bodies
// land at the same on-screen x regardless of which walk frame is showing.
export const PLAYER_COL_XSHIFT = [-0.083, 0.093];

// The walk-cycle rows aren't just off-center horizontally (see
// PLAYER_COL_XSHIFT) — they're also inconsistent vertically. Measured by
// alpha-scanning sheet_player.png row by row: the down (row 0) and up (row 1)
// frames contain only the character, feet ending at ~90% / ~82% of the cell
// height with nothing else below. The left/right frame (row 2, used mirrored
// for "right") is drawn smaller within its cell — the character itself ends
// at ~72% of the cell height — and then has a *separate, detached* shadow
// blob baked in near the very bottom (~96%-100%), floating well below the
// character's own feet. Since down/up have no baked shadow at all, that
// stray blob doesn't match anything and just reads as the character hanging
// above its own shadow while walking sideways. PLAYER_ROW_SRC_HFRAC crops
// each row's source sample to just past its own character's feet (cutting
// off the detached shadow for row 2 entirely), and PLAYER_ROW_YSHIFT nudges
// the resulting (correspondingly shorter) image down so every row's feet
// land on the same on-screen line regardless of facing.
export const PLAYER_ROW_SRC_HFRAC = { 0: 1, 1: 1, 2: 0.75 };
export const PLAYER_ROW_YSHIFT = { 0: 0, 1: 0.084, 2: 0.179 };

/** Draw one [col,row] cell of a sheet into dest rect (dx,dy,dw,dh). Returns
 * true if it actually drew something (image loaded), false if skipped.
 * xShiftFrac nudges the destination horizontally by that fraction of dw —
 * used to correct for source frames that aren't centered within their cell
 * (see PLAYER_COL_XSHIFT above). The correction is a property of the source
 * pixels (e.g. "character sits 8% right of frame-center"), but mirroring
 * flips the drawn content left/right around the rect's own center — so a
 * rightward source bias reads as a leftward bias once mirrored. The shift's
 * sign is flipped when mirror is true so it still recenters the character
 * instead of doubling the offset. srcHFrac crops the source cell to only its
 * top fraction (shrinking the drawn height proportionally, so the crop never
 * stretches the art) — used to cut a stray baked-in element off the bottom
 * of a frame (see PLAYER_ROW_SRC_HFRAC above). yShiftFrac then nudges the
 * (possibly now-shorter) destination down by that fraction of the *full*
 * dh, to re-align the cropped frame's content with other rows/frames. */
export function drawCell(ctx, sheetName, col, row, dx, dy, dw, dh, mirror = false, xShiftFrac = 0, srcHFrac = 1, yShiftFrac = 0) {
  const sheet = sheets[sheetName];
  const img = sheet.img;
  if (!img.complete || !img.naturalWidth) return false;
  const sw = img.naturalWidth / sheet.cols;
  const sh = img.naturalHeight / sheet.rows;
  const sx = col * sw, sy = row * sh;
  const ddx = dx + (mirror ? -xShiftFrac : xShiftFrac) * dw;
  const ddy = dy + yShiftFrac * dh;
  const sh2 = sh * srcHFrac, dh2 = dh * srcHFrac;
  if (mirror) {
    ctx.save();
    ctx.translate(ddx + dw, ddy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh2, 0, 0, dw, dh2);
    ctx.restore();
  } else {
    ctx.drawImage(img, sx, sy, sw, sh2, ddx, ddy, dw, dh2);
  }
  return true;
}
