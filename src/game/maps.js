// Hand-authored zone layouts for the beta. Tiles are single-character codes
// built with a small grid helper so widths can never drift out of sync.

export const TILE = 32;

function grid(width, height, fill, edits) {
  const rows = Array.from({ length: height }, () => Array(width).fill(fill));
  for (const [x, y, ch] of edits) rows[y][x] = ch;
  return rows.map(r => r.join(""));
}

// Deterministic per-index noise (mirrors render.js hashTile) so the jittered
// border depth is stable and can be reproduced anywhere without shared state.
function mhash(x, y, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2654435761;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Organic border: instead of a 1-tile ring, each edge grows inward a jittered
// 1..thickness tiles, so the boundary reads as a ragged tree line / cliff band
// rather than a flat blocked wall. Returns edits (all "#"). Forage/structure
// edits and road() segments are pushed AFTER this, so they overwrite band tiles
// — that's what keeps interior features reachable and punches a clean road
// corridor straight through the band to the map edge.
function borderBand(w, h, thickness, seed) {
  const edits = [];
  const depth = (i, side) => 1 + Math.floor(mhash(i, side * 131 + 7, seed) * thickness);
  for (let x = 0; x < w; x++) {
    const dt = depth(x, 0), db = depth(x, 1);
    for (let k = 0; k < dt; k++) edits.push([x, k, "#"]);
    for (let k = 0; k < db; k++) edits.push([x, h - 1 - k, "#"]);
  }
  for (let y = 0; y < h; y++) {
    const dl = depth(y, 2), dr = depth(y, 3);
    for (let k = 0; k < dl; k++) edits.push([k, y, "#"]);
    for (let k = 0; k < dr; k++) edits.push([w - 1 - k, y, "#"]);
  }
  return edits;
}

// A road segment as an L-path (horizontal along y0, then vertical along x1) of
// "=" tiles. Endpoints are included, so a segment can end right on a map-edge
// tile to form a "mouth" that visibly continues into the neighbouring region —
// the replacement for the old teleport gates. Roads are walkable (not in
// SOLID_TILES) and pushed last so they win their tiles.
function road(x0, y0, x1, y1) {
  const edits = [];
  const sx = Math.sign(x1 - x0) || 1;
  for (let x = x0; x !== x1 + sx; x += sx) edits.push([x, y0, "="]);
  const sy = Math.sign(y1 - y0) || 1;
  for (let y = y0; y !== y1 + sy; y += sy) edits.push([x1, y, "="]);
  return edits;
}

// Farm tile codes:
//  # wall/tree border      . grass            ~ water
//  B shipping bin (drop harvested crops/fruit/ore here; sold at day rollover)
//  c cave entrance          f petal flowers (Bloom: Petals)
//  u mushroom patch (Fungus: Wild Spores)   b berry bush (Pod: Wild Seed)
//  d claybound mound (Root: Claybound Rootlets)  w reed patch (Vine: Reed)
//  s refine station         k market stall   p hauler path
//  r collapsed road (impassable — the world implied beyond the farm's edge)
// A bigger farm with four small ponds, scattered forage clusters of every
// material (not just one each), a couple of decorative tree copses for
// visual variety, and a market/refine/hauler line on the east side.
const FARM_WIDTH = 30, FARM_HEIGHT = 18;
const farmEdits = [];
farmEdits.push(...borderBand(FARM_WIDTH, FARM_HEIGHT, 3, 101));

// ponds (the mid pond nudged down a row so the east–west road doesn't ford it)
for (let x = 3; x <= 5; x++) for (let y = 3; y <= 4; y++) farmEdits.push([x, y, "~"]);
for (let x = 4; x <= 6; x++) for (let y = 13; y <= 14; y++) farmEdits.push([x, y, "~"]);
for (let x = 22; x <= 24; x++) for (let y = 3; y <= 4; y++) farmEdits.push([x, y, "~"]);
for (let x = 15; x <= 16; x++) for (let y = 10; y <= 11; y++) farmEdits.push([x, y, "~"]);

// decorative tree copses (obstacles, purely for environment texture)
farmEdits.push([11, 6, "#"], [11, 7, "#"], [14, 7, "#"], [14, 8, "#"], [9, 13, "#"], [20, 6, "#"]);

// forage clusters — several instances of every resource type. A few nodes are
// nudged off row 9 so the worn east–west road spine stays clear of them.
farmEdits.push(
  // Petals (Bloom)
  [9, 2, "f"], [19, 3, "f"], [6, 10, "f"], [23, 12, "f"],
  // Wild Spores / mushrooms (Fungus)
  [2, 8, "u"], [12, 13, "u"], [21, 6, "u"], [27, 3, "u"],
  // Wild Seed / berry bushes (Pod)
  [13, 2, "b"], [25, 10, "b"], [17, 15, "b"], [4, 10, "b"],
  // Claybound Rootlets (Root)
  [8, 10, "d"], [18, 12, "d"], [2, 14, "d"], [26, 14, "d"],
  // Reed (Vine) — planted near water
  [6, 5, "w"], [16, 8, "w"], [23, 5, "w"], [6, 12, "w"],
);

// structures: refine station + market stall linked by a hauler path; the cave
// entrance sits just north of the road spine on the east side.
farmEdits.push(
  [24, 11, "k"],
  [24, 12, "p"], [24, 13, "p"], [24, 14, "p"],
  [24, 15, "s"],
  [27, 8, "c"],
);

// A stretch of collapsed road out past the market hints the world keeps going
// past what's currently walkable.
farmEdits.push([28, 10, "r"], [28, 11, "r"]);

// The shipping Bin sits just off the road spine beside the spawn (10,9), one
// step away and immediately usable. (The Pot is a held item, not a world tile.)
farmEdits.push([11, 8, "B"]);

// --- Roads: a worn dirt spine running the full width of the farm, carrying the
// player from the Wildwood road-mouth in the west wall, past the cave entrance,
// out to the Millbrook road-mouth in the east wall. Pushed last so the road
// carves cleanly through the organic border band at both edges.
farmEdits.push(...road(0, 9, 29, 9));

export const farmMap = grid(FARM_WIDTH, FARM_HEIGHT, ".", farmEdits);
// Spawn away from the top-left corner: that area sits directly under the
// fixed-position HUD log panel (game.css .hud-log, top:44px;left:0), which
// rendered on top of the canvas and made a freshly-spawned player invisible
// even though the sprite itself was drawing correctly underneath it.
export const farmSpawn = { x: 10, y: 9 };
export const farmCaveEntrance = { x: 27, y: 8 };
// Where the player re-enters the farm when walking a road/mouth back from each
// neighbouring region — always one tile inside the matching edge mouth.
export const farmFromCave = { x: 26, y: 8 };
export const farmFromForest = { x: 1, y: 9 };
export const farmFromTown = { x: 28, y: 9 };

// Cave tile codes: # wall   . floor   o stone rock   x ore vein rock   e exit
//  v scalding steam vent (impassable — seals off a pocket you can see but
//    not reach, standing in for a level boundary that's a physical hazard
//    rather than an invisible wall)
// A larger cave with several stone and ore clusters scattered around so
// there's always something nearby to mine.
const CAVE_WIDTH = 24, CAVE_HEIGHT = 16;
const caveEdits = [];
caveEdits.push(...borderBand(CAVE_WIDTH, CAVE_HEIGHT, 2, 202));
caveEdits.push(
  [1, 7, "e"],
  // stone clusters
  [4, 3, "o"], [5, 3, "o"], [6, 3, "o"], [4, 4, "o"],
  [10, 3, "o"], [11, 3, "o"], [10, 4, "o"],
  [6, 10, "o"], [7, 10, "o"], [6, 11, "o"],
  [15, 11, "o"], [16, 11, "o"], [15, 12, "o"],
  // ore veins
  [8, 3, "x"], [8, 4, "x"],
  [13, 5, "x"], [13, 6, "x"],
  [18, 4, "x"], [19, 4, "x"],
  [10, 11, "x"], [10, 12, "x"],
);

// A small ore pocket sealed behind a steam vent — visible through the gap in
// the wall, but the vent itself is impassable, so it just reads as "not
// reachable from here" rather than needing any explanation.
caveEdits.push(
  [19, 8, "#"], [20, 8, "#"], [21, 8, "#"], [22, 8, "#"],
  [19, 9, "#"], [20, 9, "v"],
  [19, 10, "#"], [20, 10, "#"], [21, 10, "#"], [22, 10, "#"],
  [21, 9, "x"], [22, 9, "x"],
);
// A short worn path from the mouth into the mine so the exit reads as a real
// tunnel entrance rather than a hole in the wall.
caveEdits.push(...road(2, 7, 6, 7));
export const caveMap = grid(CAVE_WIDTH, CAVE_HEIGHT, ".", caveEdits);
export const caveSpawn = { x: 2, y: 7 };
export const caveExit = { x: 1, y: 7 };

// Forest tile codes: # tree/wall   . forest floor   ~ pond   e exit to farm
//  g wild grain (Cultivate: Grain)  i fiber shrub (Cultivate: Fiber)
//  y wild seed pod (Cultivate: Farm Seed)
// This is the beta's rung-2 forage ground — Grain/Fiber/Farm Seed aren't
// obtainable anywhere else, so reaching rung 2 (mature any rung-1 spell on
// the farm) is what unlocks the gate here in the first place.
const FOREST_WIDTH = 20, FOREST_HEIGHT = 14;
const forestEdits = [];
forestEdits.push(...borderBand(FOREST_WIDTH, FOREST_HEIGHT, 2, 303));
// tree clusters for texture
forestEdits.push([5, 3, "#"], [5, 4, "#"], [10, 9, "#"], [11, 9, "#"], [14, 4, "#"], [15, 5, "#"]);
// pond
for (let x = 8; x <= 9; x++) for (let y = 2; y <= 3; y++) forestEdits.push([x, y, "~"]);
// forage clusters — several instances of each rung-2 raw material (the fiber
// shrub at row 7 nudged up a row so the road spine stays clear).
forestEdits.push(
  [4, 9, "g"], [13, 2, "g"], [17, 10, "g"], [7, 11, "g"],
  [3, 5, "i"], [16, 3, "i"], [9, 6, "i"], [12, 11, "i"],
  [6, 2, "y"], [18, 6, "y"], [2, 11, "y"], [14, 8, "y"],
);
// The Wildwood road enters from the east wall and runs into a central clearing.
forestEdits.push(...road(19, 7, 4, 7));
export const forestMap = grid(FOREST_WIDTH, FOREST_HEIGHT, ".", forestEdits);
// The player enters the Wildwood from the farm at its eastern road-mouth.
export const forestSpawn = { x: 18, y: 7 };

// Town tile codes: # building/wall   . plaza ground   ~ fountain   e exit to farm
//  r rubble (impassable — a collapsed side street, implying the town
//    continues past what's currently open, again without a popup)
//  m shop counter (walkable — click it to open the Town shop, Millbrook's
//    one real function: spend gold on rare materials or early rung unlocks)
const TOWN_WIDTH = 18, TOWN_HEIGHT = 12;
const townEdits = [];
townEdits.push(...borderBand(TOWN_WIDTH, TOWN_HEIGHT, 2, 404));
townEdits.push([6, 3, "#"], [7, 3, "#"], [6, 4, "#"], [7, 4, "#"], [11, 3, "#"], [12, 3, "#"], [11, 4, "#"], [12, 4, "#"], [9, 8, "#"], [10, 8, "#"]);
for (let x = 8; x <= 9; x++) for (let y = 6; y <= 7; y++) townEdits.push([x, y, "~"]);
townEdits.push([15, 9, "r"], [16, 9, "r"]);
townEdits.push([6, 5, "m"]);
townEdits.push([11, 5, "q"]); // town notice board — issues fetch/discovery quests (walkable)
// The cobbled road enters from the west wall and runs into the plaza past the
// shop counter (stopping short of the fountain).
townEdits.push(...road(0, 6, 6, 6));
export const townMap = grid(TOWN_WIDTH, TOWN_HEIGHT, ".", townEdits);
// The player arrives in Millbrook from the farm at its western road-mouth.
export const townSpawn = { x: 1, y: 6 };

export const RESOURCE_NODES = {
  f: { material: "Petals", label: "Petal flowers" },
  u: { material: "Wild Spores", label: "Mushroom patch" },
  b: { material: "Wild Seed", label: "Berry bush" },
  d: { material: "Claybound Rootlets", label: "Clay mound" },
  w: { material: "Reed", label: "Reed patch" },
  g: { material: "Grain", label: "Wild grain stand" },
  i: { material: "Fiber", label: "Fiber shrub" },
  y: { material: "Farm Seed", label: "Wild seed pod" },
};
export const RESPAWN_DAYS = 2;

export const MINE_ROCK = {
  o: { hp: 3, materials: ["Stone"] },
  x: { hp: 5, materials: ["Copper Ore", "Iron Ore"] },
};

export const REFINE_RECIPES = [
  { input: "Wild Spores", output: "Compost", spellRole: "Fungus" },
  { input: "Copper Ore", output: "Copper Ingot", spellRole: "Fungus" },
  { input: "Iron Ore", output: "Iron Ingot", spellRole: "Fungus" },
];

export const SOLID_TILES = new Set(["#", "~", "f", "u", "b", "d", "w", "g", "i", "y", "s", "k", "o", "x", "v", "r", "B"]);

// ---------- zone registry ----------
// Inter-zone transitions are road-mouths, not teleport gates: each exit names
// the single `mouth` tile (a road tile sitting on the map edge) that, when the
// player steps onto it, carries them into `to` — spawning at that region's own
// incoming road-mouth (one tile inside its edge) facing `face` (inward), so it
// reads as walking a continuous road between regions. Progression-gated exits
// carry a `minRung` (the mouth is treated as solid, and drawn as bramble, while
// locked) plus the `lockedMessage` shown when blocked.
export const ZONE_NAMES = { farm: "The Farm", cave: "The Mine", forest: "The Wildwood", town: "Millbrook Town" };

export const ZONE_EXITS = {
  farm: [
    { mouth: farmCaveEntrance, to: "cave", spawn: caveSpawn, face: "left", message: "You duck into the mine." },
    { mouth: { x: 0, y: 9 }, to: "forest", spawn: forestSpawn, face: "left", message: "The road winds west into the Wildwood.", minRung: 2, lockedMessage: "Thick bramble chokes the road west — the growth looks too tangled to push through yet." },
    { mouth: { x: 29, y: 9 }, to: "town", spawn: townSpawn, face: "right", message: "The road leads on to Millbrook." },
  ],
  cave: [
    { mouth: caveExit, to: "farm", spawn: farmFromCave, face: "left", message: "Back out on the farm." },
  ],
  forest: [
    { mouth: { x: 19, y: 7 }, to: "farm", spawn: farmFromForest, face: "right", message: "The road leads back to the farm." },
  ],
  town: [
    { mouth: { x: 0, y: 6 }, to: "farm", spawn: farmFromTown, face: "right", message: "The road leads back to the farm." },
  ],
};
