# Pixel Art Asset Generation Guide

This is the brief to hand to an AI image generator (Midjourney, DALL·E, Stable
Diffusion + a pixel-art LoRA, Retro Diffusion, PixelLab, Scenario, etc.) to
replace the current procedural canvas-drawn placeholders in
`src/game/render.js` with real pixel art. Everything below is grounded in the
actual game code (`src/game/maps.js`, `src/game/render.js`,
`src/data/spellSystem.js`) so nothing here is invented — it matches the tile
codes, colors, and mechanics already implemented.

---

## 0. Global style bible — put this in every prompt

Copy this block into the start of *every single* generation prompt so all
assets feel like one game:

> 2D top-down pixel art game asset, Stardew Valley / Secret of Mana style,
> 32x32 pixel grid, crisp hard pixel edges, no anti-aliasing, no blur, no
> gradients, no soft shadows, limited retro color palette, thin 1px dark-brown
> outline (#2a2018) around all solid shapes, single light source from the
> upper-left, flat cel shading with at most 2 shade steps per color,
> transparent background, no text, no watermark, no border/frame.

**Technical rules (apply to all assets):**

- **Native grid:** the game's tile size is `32x32` px. Generate at a clean
  multiple of that (e.g. `256x256` or `512x512`) so it downsamples losslessly
  with **nearest-neighbor** to `32x32` (character sprite sheets are the
  exception — see below). Never generate at an odd resolution you'd have to
  stretch.
- **Perspective:** top-down / slight 3-quarter top-down. Not side-view, not
  isometric.
- **Palette discipline:** reuse the hex colors already established in code
  wherever an asset already has an established color (listed per-item below)
  so new art doesn't clash with existing UI. Keep total unique colors per
  sprite under ~12.
- **Transparency:** every sprite/object/character must be exported as PNG-24
  with a real alpha channel (not a white/checkerboard background). Only the
  full-bleed ground tile textures (grass, water, cave floor, cave wall) are
  exempt — those should be edge-to-edge, seamlessly tileable.
- **Consistency trick:** generate one "style anchor" image first (e.g. the
  player idle-down frame or the grass tile), then feed it back in as an image
  prompt / reference for every subsequent asset (or lock the seed) so the
  whole set reads as one art pass instead of 30 unrelated images.
- **Post-processing after generation (do this for every asset, every time):**
  1. Import into Aseprite/Photopea/GIMP.
  2. Downscale with **nearest neighbor** (never bilinear/bicubic) to the exact
     target pixel size.
  3. Snap every shape to the pixel grid; clean up any stray anti-aliased
     pixels the AI left behind.
  4. Reduce to an indexed palette and delete background pixels to true alpha.
  5. Export PNG, name it exactly as specified in each section below (the
     filenames map directly to the tile codes in `maps.js`/`render.js` so
     they can be dropped straight into an atlas).

---

## 1. Full asset list (grouped by category)

| # | Category | Asset | Priority |
|---|----------|-------|----------|
| 1 | Character | Player, 4-direction walk sheet | Critical |
| 2 | Farm tile | Grass (`.`) | Critical |
| 3 | Farm tile | Water (`~`) + shimmer frames | Critical |
| 4 | Farm tile | Border tree/hedge (`#`) | Critical |
| 5 | Farm tile | Tilled soil (`D`) | Critical |
| 6 | Farm tile | Hauler path (`p`) | High |
| 7 | Resource node | Petal flowers (`f`, Bloom/Petals) | Critical |
| 8 | Resource node | Mushroom patch (`u`, Fungus/Wild Spores) | Critical |
| 9 | Resource node | Berry bush (`b`, Pod/Wild Seed) | Critical |
| 10 | Resource node | Clay mound (`d`, Root/Claybound Rootlets) | Critical |
| 11 | Resource node | Reed patch (`w`, Vine/Reed) | Critical |
| 12 | Structure | Refine station (`s`) | High |
| 13 | Structure | Market stall (`k`) | High |
| 14 | Structure | Cave entrance, farm side (`c`) | High |
| 15 | Cave tile | Cave floor (`.`) | Critical |
| 16 | Cave tile | Cave wall (`#`) | Critical |
| 17 | Cave tile | Cave exit (`e`) | High |
| 18 | Cave rock | Stone rock (`o`) + 3 damage states | Critical |
| 19 | Cave rock | Ore vein rock (`x`) + 3 damage states | Critical |
| 20 | Crop | Seedling stage (universal, all roles) | High |
| 21 | Crop | Mid-growth stage (universal, all roles) | High |
| 22 | Crop | Mature/ready stage ×5 (one per Role: Bloom/Root/Vine/Fungus/Pod) | High |
| 23 | Icon (stretch) | 5 catalyst icons (Sunlight/Water/Snowfall/Darkness/Moonlight) | Optional |
| 24 | Icon (stretch) | Gold coin icon | Optional |
| 25 | Icon (stretch) | Depleted/regrowing overlay (generic "harvested" marker) | Optional |

Items 1–19 are what's rendered every frame today (`render.js`) — do these
first. Items 20–22 replace the current abstract colored-dot crop indicator in
`drawPlot()`. Items 23–25 are only needed if you want to also reskin the HUD
away from the current Phosphor icon set — the game is fully playable without
them.

---

## 2. Per-asset instructions

### 1. Player character — 4-direction walk sheet

**Current placeholder:** tan round head, brown side-part hair, blue tunic
(`#3c6b8a`), brown trousers/legs (`#4a3220`), simple black eye dots that shift
per facing direction.

**What to generate:** a single sprite sheet, one row per facing direction
(down, up, left, right — in that order top-to-bottom), 2 frames per row (feet
together / feet apart mid-stride) so the engine's existing `animFrame` toggle
has something to swap between. That's an **8-frame sheet**, laid out as a
4-row × 2-column grid.

- Canvas: each cell 64x64 (renders down to a 32px-wide character with some
  headroom above the tile), full sheet 128x256.
- Character build: small/chibi proportions, farmer archetype — simple tunic,
  no elaborate armor or props, hands empty (the game doesn't show held tools).
- Palette: keep the existing tan skin `#e8c088`, brown hair `#4a3220`, blue
  tunic `#3c6b8a`, dark boots/shadow `#2a2018`. You may add 1–2 shading tones
  of each but don't introduce unrelated hues.
- Facing readability is critical: `down` shows the full face, `up` shows the
  back of the head (no face), `left`/`right` show a clear side profile so the
  direction is unambiguous at a glance even at 32px.
- Prompt suffix to add: *"character reference sheet, 4 rows labeled facing
  down/up/left/right, 2 walk frames per row, chibi farmer, simple tunic,
  empty hands, consistent palette across all rows"*.
- File names: `player_down_0.png`, `player_down_1.png`, `player_up_0.png`,
  `player_up_1.png`, `player_left_0.png`, `player_left_1.png`,
  `player_right_0.png`, `player_right_1.png` (or keep as one sheet
  `player_sheet.png` and slice in code — either works, but slice consistently
  since `render.js` currently draws the player centered on `player.x,
  player.y` with the feet near the bottom of the sprite).

### 2. Grass tile (`.`, farm ground)

Base color `#7cab54`. Flat green field grass, subtle single-tone texture
(a few darker blade tufts), no flowers or props baked in (those are separate
resource-node sprites layered on top). Must tile seamlessly in all 4
directions — generate as a repeating pattern and verify by tiling 2×2 before
export. File: `tile_grass.png` (32x32, opaque, no alpha needed).

### 3. Water tile (`~`, farm pond)

Base color `#4a86ad`, lighter ripple highlight `#6fa8c9`. Generate **3
animation frames** of a calm pond surface with a slowly-shifting ripple
band (matches the current single ripple stripe near the top of the tile).
Must tile seamlessly edge-to-edge with itself. Files: `tile_water_0.png`,
`tile_water_1.png`, `tile_water_2.png` (32x32 each, opaque).

### 4. Border tree/hedge (`#`, farm map edge)

This is the impassable border ringing the whole farm map. Base ground
`#2c3a20` with a denser hedge/tree-canopy shape `#4a5d34` filling most of the
tile (currently a simple inset rectangle). Should read as "you can't walk
here" — dense foliage, no gaps. Slight canopy texture (a few darker leaf
clusters), no trunks needed since it's a continuous border. File:
`tile_border.png` (32x32, opaque).

### 5. Tilled soil (`D`)

Base dirt brown `#6b4a2f` with darker furrow lines `#4a3220` running
vertically (currently 4 evenly-spaced tilled rows per tile). Should look like
a freshly-turned farm plot, empty (no crop) — crops are drawn as a separate
layer on top per the Crop section below. File: `tile_tilled.png` (32x32,
opaque).

### 6. Hauler path (`p`)

Tan/beige packed-dirt path `#c9b98a` with small pebble/gravel flecks
`#a99259` scattered across it (currently a sparse dot pattern). Should read
clearly as a walkway distinct from grass. File: `tile_path.png` (32x32,
opaque).

### 7–11. Farm resource nodes

All five sit centered on a grass tile and should be drawn with **transparent
background** so the grass tile shows through around them (they're rendered as
an overlay on top of the grass base tile, not a full replacement tile).
Canvas 32x32, alpha PNG. Each needs a **"depleted" variant** — a visibly
smaller/wilted/cut-back version — because after foraging the node disappears
for `RESPAWN_DAYS` and the game currently just tints the tile with a
translucent green overlay; a real depleted sprite (e.g. bare stems, empty
patch of dirt) would read much better than the current tint hack.

- **7. Petal flowers** (`f` — Bloom role, yields *Petals*). Pink 4-petal
  flower cluster, `#e08fc2` petals with a yellow `#e9c14a` center, arranged
  in a small clump of 2–3 blooms. Depleted variant: bare green stems, no
  flower heads. Files: `node_petals.png`, `node_petals_depleted.png`.
- **8. Mushroom patch** (`u` — Fungus role, yields *Wild Spores*). Purple-cap
  mushroom cluster, cap `#8f6a92`, cream stem `#e8dcc0`, small pale spots
  `#c9a6cf`. 2–3 mushrooms of varying height. Depleted variant: a few broken
  stem stubs. Files: `node_spores.png`, `node_spores_depleted.png`.
- **9. Berry bush** (`b` — Pod role, yields *Wild Seed*). Rounded green bush
  `#3f6b2e` studded with small red berries `#a3272f` (4–5 berries visible).
  Depleted variant: same bush silhouette with no berries. Files:
  `node_berries.png`, `node_berries_depleted.png`.
- **10. Clay mound** (`d` — Root role, yields *Claybound Rootlets*). Low
  rounded mound of reddish-brown clay `#8a5937` with a darker cracked patch
  `#6f4529` on one side. Depleted variant: a flattened/dug-out version of the
  same mound. Files: `node_clay.png`, `node_clay_depleted.png`.
- **11. Reed patch** (`w` — Vine role, yields *Reed*). 3 tall curved green
  reed blades `#4f7a3a`, slightly different heights, growing straight up from
  a grass base. Depleted variant: short cut stubs only. Files:
  `node_reed.png`, `node_reed_depleted.png`.

### 12. Refine station (`s`)

A simple wooden workbench/kiln structure — brown base `#7a5230` with a darker
brown trim/roof lip `#5c3d24` (currently drawn as two stacked rectangles: a
short dark lip on top of a taller body). Think small rustic crafting station,
not a full building — should fit in a single 32x32 footprint but can bleed
slightly upward into the tile above via transparent canvas padding if it
needs a taller silhouette (generate on a 32x48 canvas anchored to the bottom
if so). File: `struct_refine.png`.

### 13. Market stall

A small striped-awning market stall — red-and-cream striped awning
`#c0463f` on top, wooden support posts `#8a6b3f` below (currently a red
awning band with vertical post ticks). Same footprint note as above — use a
32x48 canvas anchored bottom if the awning needs height. File:
`struct_market.png`.

### 14. Cave entrance (farm side) (`c`)

A dark oval cave mouth set into the ground, near-black `#171310`, with maybe
a subtle lighter rim of rock/dirt around the opening so it doesn't look like
a flat hole. Sits flush on a grass tile. File: `struct_cave_entrance.png`
(32x32, can be mostly opaque dark shape over transparent corners).

### 15. Cave floor (`.`)

Dark packed-earth cave ground `#332a20`, flat, subtle mottled texture (no
props). Must tile seamlessly. File: `tile_cave_floor.png` (32x32, opaque).

### 16. Cave wall (`#`)

Near-black rough stone wall `#171310` with a slightly lighter inset rock
texture `#211a13` (currently a simple inset rectangle suggesting rough-hewn
stone blocks). Must read clearly as impassable/solid, must tile seamlessly
along wall runs. File: `tile_cave_wall.png` (32x32, opaque).

### 17. Cave exit (`e`)

Warm golden glow `#e9c14a` — a shaft of light coming down from the surface,
oval-shaped on the floor. Should look inviting compared to the dark cave
around it (visual cue this leads back outside). File:
`struct_cave_exit.png` (32x32, glow can have soft-alpha edge only — keep the
"no gradients" rule for the hard shapes but a light bloom is the one
exception where a soft falloff is acceptable since it represents light, not a
solid surface).

### 18. Stone rock (`o`, cave — mined with a Root spell, 3 HP)

Gray angular rock cluster `#8a8a8a` (currently an irregular hex/gem-cut
silhouette). Generate **4 states**: full health, then 3 progressively more
cracked/damaged versions (crack lines `#2a2018`, then chunks visibly broken
off, then a near-rubble state right before it breaks). Files:
`rock_stone_0.png` (full) through `rock_stone_3.png` (about to break). Keep
the same base silhouette across all 4 so it doesn't "pop" between damage
states — only add cracks/chips.

### 19. Ore vein rock (`x`, cave — mined with a Root spell, 5 HP)

Same gray rock silhouette as above but with visible gold ore flecks
`#e9c14a` embedded in it (currently 3 small dots). Generate the same
**4 damage states** as the stone rock (full → 3 more cracked stages),
keeping the gold flecks visible at every stage until it breaks. Files:
`rock_ore_0.png` through `rock_ore_3.png`.

### 20–22. Crop growth stages

These replace the current abstract "colored dot on a stem" plot indicator in
`drawPlot()`. A plot cycles: tilled (empty) → seedling → mid-growth →
mature/ready-to-harvest. The role of the planted spell (Bloom/Root/Vine/
Fungus/Pod) is only visually distinguished at the **mature** stage today (by
color), so:

- **20. Seedling** (universal, any role): a single tiny green sprout,
  2-leaf, `#5c8a3a`, centered on the tilled-soil tile. One sprite works for
  every role. File: `crop_seedling.png`.
- **21. Mid-growth** (universal, any role): a small leafy plant, still no
  distinguishing role color, taller than the seedling with 4–5 leaves,
  `#3d6b2e` stem. File: `crop_midgrowth.png`.
- **22. Mature/ready — 5 variants, one per role**, using the game's existing
  role colors so they stay consistent with the hotbar badges in the HUD
  (`roleMarks`/`ROLE_COLORS` in code):
  - Bloom → pink flower in full bloom, `#d98cc0`. File: `crop_mature_bloom.png`.
  - Root → a knotted root/tuber breaking the soil surface, `#8a5937`. File:
    `crop_mature_root.png`.
  - Vine → a curling vine with a small fruit/leaf cluster, `#5c8a3a`. File:
    `crop_mature_vine.png`.
  - Fungus → a small mushroom cluster, `#8f6a92`. File:
    `crop_mature_fungus.png`.
  - Pod → a plump seed pod/berry cluster, `#c07d3f`. File:
    `crop_mature_pod.png`.
  All 5 mature sprites should share the same base plant silhouette/scale so
  they read as "the same crop, different bloom," only the color and the
  head/fruit shape should change per role.

### 23–25. Optional icon set (only if reskinning the HUD too)

The HUD currently uses Phosphor React icons (`Sun`, `Drop`, `Snowflake`,
`Mountains`, `Moon`, `CoinVertical`, `CalendarBlank`, `X`) which already look
clean and don't strictly need replacing. If you want a fully bespoke pixel-art
HUD to match the world art:

- **23. Catalyst icons** — 5 small 16x16 pixel icons: sun (Sunlight), droplet
  (Water), snowflake (Snowfall), mountain (Darkness), crescent moon
  (Moonlight). Keep them simple/high-contrast since they render at small
  size next to text.
- **24. Gold coin icon** — 16x16, a single gold coin `#e9c14a` with a simple
  emboss detail, matches the `g` currency shown throughout the HUD.
- **25. Depleted/regrowing overlay** — a small "..." or wilted-leaf badge
  that can be composited over any resource node instead of the current flat
  green tint, for nodes that don't already have a bespoke depleted sprite.

---

## 3. Suggested generation order

1. Player walk sheet (style anchor — lock this look in first).
2. Grass + water + border + tilled soil + path (the 5 farm ground tiles).
3. The 5 resource nodes + their depleted variants.
4. Refine station + market stall + cave entrance.
5. Cave floor + cave wall + cave exit.
6. Stone rock + ore vein rock, each with 4 damage states.
7. Crop seedling + mid-growth + 5 mature role variants.
8. (Optional) icon set.

## 4. Wiring generated art back into the game

Once assets are ready, replace the corresponding hand-drawn function bodies in
`src/game/render.js` (`drawFarmTile`, `drawCaveTile`, `drawResourceIcon`,
`drawRock`, `drawPlot`, `drawPlayer`) with `ctx.drawImage(...)` calls against
a loaded `Image`/sprite-sheet atlas, keyed off the same tile-character /
role lookups already used there (`FARM_COLORS`, `CAVE_COLORS`,
`RESOURCE_NODES`, `ROLE_COLORS`). The tile codes and role names are the same
strings used throughout `maps.js` and `spellSystem.js`, so no data-layer
changes are needed — only the drawing functions swap from vector shapes to
`drawImage`.

---

## 5. Addendum — spells-as-tools rework materials, terrain, and shop items

Added in a later pass that removed the fixed toolkit in favor of spells,
gave Millbrook Town its shop, and introduced ~22 new plantable/refined
materials plus a two-item Artifact system (`src/game/GameEngine.js`:
`materialsByRung`/`ARTIFACTS` — see `src/data/spellSystem.js` for the
authoritative rung/material lists). None of it has real sprite art yet — a
procedural stopgap (`src/game/materialIcons.js`) draws a distinct hand-coded
icon for every item so nothing renders as a flat color swatch in the
meantime, and the colors listed below are pulled directly from that module
so real art replaces the stopgap without a palette shift. Use the same
Section 0 global style bible for every prompt in this addendum.

### Group A — un-sprited materials (item icons, ~32x32 alpha PNG each)

These are inventory/materials-bar icons, not world tiles — same treatment as
the resource-node icons in Section 2 (transparent background, centered
subject, readable at 16-24px display size). Existing procedural color pairs
are listed so the real art stays consistent with the game's current palette.

| Material | Rung | Base color | Accent/dark | Visual idea | File |
|---|---|---|---|---|---|
| Clay | 1 | `#b57a4a` | `#8a5937` | soft rounded lump of wet clay | `mat_clay.png` |
| Compost | 2 | `#5c4a30` | `#3a2f1e` | dark crumbly humus mound | `mat_compost.png` |
| Grain | 2 | `#d9b54a` | — | 3 wheat-like stalks with seed heads (existing precedent, keep as-is) | `mat_grain.png` |
| Copper Ore | 2 | `#c07d3f` | `#8a5937` | rough ore chunk w/ copper flecks | `mat_copper_ore.png` |
| Stone | 2 | `#8a8477` | `#5c5648` | plain gray rock chunk | `mat_stone.png` |
| Fiber | 2 | `#8fae5c` | — | loose bundled plant fiber strands (existing precedent, keep as-is) | `mat_fiber.png` |
| Farm Seed | 2 | `#c98a4b` | `#8a5f2d` | 3-lobed seed pod cluster (existing precedent, keep as-is) | `mat_farm_seed.png` |
| Wax | 3 | `#e8c86a` | `#f4d35e` | glossy amber droplet | `mat_wax.png` |
| Iron Ingot | 3 | `#9aa0a8` | `#d8dee4` | small metal bar with a top shine strip | `mat_iron_ingot.png` |
| Cloth | 3 | `#cbb98f` | `#a5906a` | folded fabric square with visible fold lines | `mat_cloth.png` |
| Iron Ore | 3 | `#6d675e` | `#403c34` | dark rough ore chunk | `mat_iron_ore.png` |
| Rope | 3 | `#a5824a` | — | coiled rope spiral | `mat_rope.png` |
| Honey | 3 | `#e6a323` | `#f4d35e` | glossy golden droplet with a soft glow halo | `mat_honey.png` |
| Essence | 4 | `#c9a5e8` | `#9fb6e0` | violet-blue droplet with a soft glow halo | `mat_essence.png` |
| Alloy | 4 | `#8a97a8` | `#e0e8f0` | polished silver-blue metal bar | `mat_alloy.png` |
| Confection | 4 | `#e8a3c0` | `#d9789f` | small pink candy/pastry blob cluster | `mat_confection.png` |
| Everbloom Pollen | 5 | `#f4d35e` | — | 5-point sparkle cluster radiating from a bright core | `mat_everbloom_pollen.png` |
| Crystal Shard | 5 | `#6ac8d8` | `#bfeef5` | faceted cyan gem/diamond shape | `mat_crystal_shard.png` |
| Skyvine Silk | 5 | `#a8d8c8` | `#7ab5a0` | pale teal folded fabric square | `mat_skyvine_silk.png` |
| Moonspore | 5 | `#9fb6e0` | — | 5-point sparkle cluster, cool blue-violet tones | `mat_moonspore.png` |
| Everbloom Seed | 5 | `#e9c14a` | `#fff0b0` | faceted golden gem/seed shape | `mat_everbloom_seed.png` |
| Copper Ingot | 3 | `#c07d3f` | `#f0b878` | small warm-copper metal bar with a top shine strip | `mat_copper_ingot.png` |

### Group B — Forest zone terrain tileset

Currently fully procedural (`drawForestFloor`/`drawForestBorder` in
`render.js`): a flat moss-green floor `#4f7a3d` with scattered darker/lighter
speckle dots, and a near-black canopy border `#16261a` with 5 overlapping
dark-green canopy blobs (`#254d2c`/`#1e3a22`). Generate as real seamless
tiles:

- **Forest floor** — mossy woodland ground, base `#4f7a3d`, small darker
  `#3f6b34` and lighter `#5c8a49` moss/leaf-litter speckles scattered
  irregularly (not a grid). Must tile seamlessly. File: `tile_forest_floor.png`
  (32x32, opaque).
- **Forest border/canopy** — the impassable tree-line ringing the Wildwood
  map, near-black understory `#16261a` mostly hidden under a dense layered
  tree-canopy silhouette in two dark greens (`#254d2c`, `#1e3a22`). Should
  read as "dense forest wall," continuous with no gaps. File:
  `tile_forest_border.png` (32x32, opaque).

### Group C — Town zone terrain tileset

Currently fully procedural (`drawTownFloor`/`drawTownWall` in `render.js`): a
tan cobblestone plaza `#c9b98a` with a scattered 3x3-per-tile grid of lighter
(`#d8c89a`) and darker (`#b7a679`) paving-stone squares, and cream
half-timber building walls `#e8ddc4` with dark-brown `#5c4a34` horizontal and
vertical timber beams.

- **Town plaza cobblestone** — tan `#c9b98a` base with an irregular
  paving-stone pattern using `#d8c89a` (lighter stones) and `#b7a679`
  (darker/worn stones), grout lines implied by the gaps between stones. Must
  tile seamlessly. File: `tile_town_plaza.png` (32x32, opaque).
- **Town building wall** — cream half-timber wall `#e8ddc4` with dark-brown
  `#5c4a34` structural beams: one horizontal beam roughly through the middle,
  two vertical beams flanking the center. Must read as "building, can't walk
  here." File: `tile_town_wall.png` (32x32, opaque).

### Group D — Shop counter structure (`m`, Millbrook Town's shop tile)

New in this pass (`drawShopCounter` in `render.js`) — currently a procedural
market stall: a wooden counter body `#6d4a2f` with a darker front lip
`#4a3220`, a 4-stripe red/cream awning (`#b23b3b`/`#e8ddc4`) above it on two
dark support posts `#3a2c1c`, and a small gold coin accent `#e9c14a` on the
counter front (visually distinct from the existing Section 2 "Market stall"
node #13, since this is Town's own shop counter, not the farm's sell
station). Same footprint convention as #12/#13 above — generate on a 32x48
canvas anchored to the bottom if the awning needs height. File:
`struct_shop_counter.png`.

### Group E — Artifact icons

Single-slot equippable "proper items" (`ARTIFACTS` in `GameEngine.js`),
currently rendered with the same procedural icon as their source material
(Group A: Alloy, Moonspore) since they're literally that material once
equipped. If distinct equipped-state art is wanted:

- **Alloy Charm** — a small circular pendant/charm shape in the existing
  Alloy palette (`#8a97a8` base, `#e0e8f0` shine), with a subtle "+1g" coin
  motif worked into the design (its effect is a flat gold bonus per fruit
  sold). File: `artifact_alloy_charm.png`.
- **Moonspore Talisman** — a small crescent-moon-shaped talisman in the
  existing Moonspore palette (cool blue-violet, `#9fb6e0`), with a soft glow
  halo (its effect eases seasonal weather requirements). File:
  `artifact_moonspore_talisman.png`.

### Wiring this addendum's art back into the game

Once real art exists for any of the above, swap the corresponding lookup in
`src/game/materialIcons.js`'s `ICONS` table (Group A) to a sprite-sheet crop
instead of a procedural draw call — same pattern `MaterialIcon` in
`Hud.jsx`/`drawResourceIcon` in `render.js` already use for the original 5
sprited farm materials (`NODE_COLUMN` in `sprites.js`). Group B/C terrain
swaps into `drawForestFloor`/`drawForestBorder`/`drawTownFloor`/
`drawTownWall`. Group D swaps into `drawShopCounter`. No data-layer changes
are needed for any of it — only the drawing functions change.

## Addendum 2 — "The Withering" pillar, quest board & effects pass

This addendum covers everything added by the quest/blight/emergent-farming
rewrite. Same conventions as above: 32x32 opaque unless a footprint (e.g.
32x48 bottom-anchored) is noted; palettes below are the exact procedural
colors currently drawn, so real art staying near them drops in without
retuning the rest of the frame.

### Group F — Town notice board (`q`, the quest-board tile)

New walkable town tile placed at town `(11,5)` (`drawNoticeBoard` in
`render.js`). Currently procedural: a two-post wooden board `#5c4128` frame
with a lighter pinboard face `#c2a878`, three small pinned paper notes
(`#f2ead2`) at slight angles, and a red wax pin dot `#b23b3b` on one note.
Reads as "public notices — come read the quests." Clicking it (or pressing E
adjacent) toggles the QuestBoard HUD overlay.

- **Notice board** — weathered wooden bulletin board on two posts, cork/board
  face `#c2a878` in a dark frame `#5c4128`, 3–4 pinned parchment notes
  `#f2ead2` with tiny ink scribbles and one red pin `#b23b3b`. Bottom-anchored
  on a 32x48 canvas so the posts read as planted in the ground. File:
  `struct_notice_board.png`.

### Group G — Blight ("The Withering") tile overlay

Drawn *on top of* the underlying grass tile (`drawBlight` in `render.js`), not
a standalone terrain tile — so it needs a transparent background. Currently
procedural: a semi-transparent violet stain `rgba(120,60,140,~.4)` with
darker creeping veins `#5c2a66` and a few rising violet motes `#c48fd9`.
Reads as "corrupted, cure this." Three static patches seed on the farm; a
matching-role spell cast on one clears it.

- **Blight overlay** — sickly violet/magenta corruption blotch with irregular
  fungal veins radiating outward, translucent center (`rgba(120,60,140,0.4)`),
  opaque vein detail `#5c2a66`, a few faint spore motes `#c48fd9` near the top.
  MUST have a transparent background (it composites over grass). Optionally
  supply 2–3 intensity variants (light/medium/heavy) for future spread stages.
  File: `overlay_blight.png` (32x32, transparent).

### Group H — Larger-zone tileset note

The camera rewrite (`camera.js` + `render.js` translate/cull) means zones are
no longer one-screen boards — `maps.js` arrays can grow arbitrarily large and
the viewport scrolls to follow the player. No new *art* is required for this
(all existing Group A–E tiles already tile seamlessly), but any future
hand-authored tileset should be built as seamless 32x32 tiles precisely
because large scrolling zones will repeat them many times across a frame;
avoid per-tile unique lighting that would reveal the grid when tiled.

### Group I — Cosmetic effects (particles & floating text)

Fully procedural and intentionally code-drawn (`drawEffects` in `render.js`,
spawned by `spawnFloat`/`spawnBurst` in `GameEngine.js`) — listed here only so
an artist knows the palette if sprite-based particles are ever wanted:

- till dust burst `#8a6a44`, forage sparkle `#6ea24a`, mine chips `#9a8c74`,
  harvest `+N` floater `#f0c96a`, gold-gain floater `#e9c14a`, blight-cleanse
  burst `#b278c8` / `#c48fd9`. Floating text uses "Pixelify Sans".

If replaced with sprites, a single 4–6 frame 16x16 puff/spark sheet per color
family would suffice; wire it into `drawEffects` keyed on `e.kind`/`e.color`.

### Group J — Seasonal tint

`SEASON_TINT` in `render.js` is a flat full-viewport screen-space wash per
season (spring faint green, summer warm gold, autumn amber, winter cool blue),
all very low alpha (0.06–0.11). No art needed — documented so the mood layer
isn't mistaken for a bug or duplicated in a tileset. Tune the alphas/hues
there if a stronger day/night feel is wanted later.

### Wiring Addendum 2 art back in

Group F swaps into `drawNoticeBoard`; Group G into `drawBlight` (keep the
transparent composite). Groups H–J are behavioral/screen-space and need no
data changes — only the corresponding draw functions in `render.js`.
