import {
  TILE, farmMap, caveMap, forestMap, townMap, farmSpawn,
  RESOURCE_NODES, RESPAWN_DAYS, MINE_ROCK, REFINE_RECIPES, SOLID_TILES,
  ZONE_EXITS, ZONE_NAMES,
} from "./maps.js";
import { spells, materialsByRung, seasonalConditions, resolveRecipe, essenceSources, STARTER_SPELL_IDS, spellRequirements } from "../data/spellSystem.js";

// Dev-only HMR guard. The engine is a single long-lived class instance held in
// a React ref (Game.jsx) and constructed exactly once. React Fast Refresh
// preserves that ref across edits, so hot-updating this module would strand the
// running game on an OLD instance that lacks any newly-added methods or
// constructor fields (e.g. a freshly-added overlay toggle would silently no-op).
// Declining HMR forces a full page reload — and a freshly-built engine — on any
// change here. In a production build import.meta.hot is undefined, so this is
// stripped entirely.
if (import.meta.hot) import.meta.hot.decline();

const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
const SPEED = 150; // px/s
const HITBOX = 22;
// Per-day probability that a foraged-out node regrows. Nodes no longer come
// back on a fixed timer — each day that's passed since it was picked, a
// depleted node independently rolls this chance, so forage repopulates the
// world randomly over time (expected return ~1/chance days after the pick).
const NODE_RESPAWN_CHANCE = 0.4;

// Planting is now three direct world actions instead of a menu — plant a
// seed, spray out its own essence, then release drawn-in environmental
// energy — but the plot still glows through each stage exactly like the old
// ritual did (see render.js: drawRitualEffect, which reads engine.plotEffect
// and is otherwise untouched — it just keys off the same step names).
const ACTION_GLOW_HOLD = 1.0; // seconds the one-shot seed/essence glow lingers
const RITUAL_CAST_DURATION = 0.9; // seconds the final casting burst plays before resolving
const RITUAL_RESULT_HOLD = 1.6; // seconds the resolved outcome lingers before it clears

// Every material that can be sprayed into an essence maps to exactly one
// role (see spellSystem.js: essenceSources — each material only ever
// appears under a single role's source list). Reversing that table means a
// planted seed's own essence is never a free choice: it's whatever role its
// foraged material naturally carries.
const MATERIAL_ROLE = Object.fromEntries(
  Object.entries(essenceSources).flatMap(([role, info]) => info.sources.map(src => [src.material, role]))
);

// What environmental energy a plain ground/water tile offers the Worn
// Satchel, per zone — the literal "draw on the environment's energy, like
// sunlight" action. Water is universal (any pond/stream); everything else is
// the ambient character each zone already has (sunny farmland, the dark
// mine, the moonlit Wildwood), with farmland/town switching from Sunlight to
// Snowfall during Winter.
function catalystFromTile(zone, tile, season) {
  if (tile === "~") return "Water";
  if (tile !== ".") return null;
  if (zone === "cave") return "Darkness";
  if (zone === "forest") return "Moonlight";
  if (zone === "farm" || zone === "town") return season === "Winter" ? "Snowfall" : "Sunlight";
  return null;
}

// The "family" a catalyst belongs to — a coarse discovery hint (clue level 3)
// that narrows the catalyst without naming it, reusing the light/dark grouping
// already implicit in the fizzle rules.
function catalystFamily(catalyst) {
  if (catalyst === "Sunlight" || catalyst === "Snowfall") return "a bright catalyst";
  if (catalyst === "Moonlight") return "a moonlit catalyst";
  if (catalyst === "Darkness") return "a dark catalyst";
  if (catalyst === "Water") return "a watery catalyst";
  return "some catalyst";
}

// Spells fully replace tools — there is no more fixed toolkit. Every action
// that used to need a specific tool now needs an equipped spell of the
// matching role instead (see STARTER_SPELL_IDS in spellSystem.js for the 4
// pre-known rung-1 spells that make this available from minute one):
//   till            -> Bloom
//   mine (cave)     -> Root      (already the existing "spell replaces tool" precedent)
//   spray essence   -> Fungus
//   draw/release energy (satchel) -> Vine
// Selling/harvesting Pod fruit was never tool-gated, so Pod needs no starter.
const MAX_STACK = 20; // per-material stack cap — see addItem()
// Minecraft-style material grid: a fixed 6×4 field of slots the Inventory
// screen projects the material bag onto (see getInvSlots / invOrder).
const INV_COLS = 6, INV_ROWS = 4, INV_SLOTS = INV_COLS * INV_ROWS;
// The Wand: a fixed row of equipped spell slots shown as the on-screen "Wand"
// bar and edited in the Inventory's Wand tab. Spells are NOT items — they live
// only in the wand, never in the material bag or the item hotbar.
const WAND_SLOTS = 6;
// Minecraft-style item hotbar: a fixed row that holds MATERIALS (seeds/reagents)
// mirrored from the bag, shown as the bottom row of the Inventory screen and as
// the on-screen materials bar. Matches INV_COLS so they line up column-for-column.
const ITEM_HOTBAR = INV_COLS;

// The six stages of the planting ritual, in order — the labels the on-screen
// step-by-step guide shows (see computeRitualGuide / Hud RitualGuide).
const RITUAL_STEPS = [
  "Till the soil",
  "Plant a crop seed",
  "Let it grow (cast Grow to hurry)",
  "Harvest the crop",
];

// The Withering (second-pillar payoff): reputation earned from town requests
// and cleansing blight banks toward this threshold, which unlocks the shop's
// rarest (rung-5) stock — the only source of rung-5 seed materials, so the
// endgame spells finally depend on engaging with the pillar, not just gold.
const REP_PREMIUM_GATE = 8;

// Single-slot equippable artifacts — "proper items" with a real passive
// effect, sourced from rung-4/5 harvests (materialsByRung), rather than more
// stackable clutter. Keyed by the material name that's consumed to equip it.
export const ARTIFACTS = {
  Alloy: { name: "Alloy Charm", effect: "+1g per fruit sold" },
  Moonspore: { name: "Moonspore Talisman", effect: "Eases seasonal requirements by 1" },
};

// ---- Energy & Essence -------------------------------------------------------
// Two new item families that live in this.inventory like any other material but
// are NON-plantable (guarded in plantAt) and hidden from the seed materials-bar:
//   • Energy — Sunlight/Moonlight/Water/Darkness/Snowfall, siphoned from the
//     world by the Aether Wand (siphonEnergy / G). What each tile offers reuses
//     catalystFromTile, so the "draw ambient energy" idea now yields carryable
//     resources instead of a single satchel charge.
//   • Essence — one per spell role, distilled in the Inventory's Crafting tab
//     from 2 of the role's source materials + 1 energy. A role Essence is a
//     universal premium reagent: reagentName spends it first for any spell of
//     that role's active cast (see below), so crafting directly powers casting.
export const ENERGY_TYPES = ["Sunlight", "Moonlight", "Water", "Darkness", "Snowfall"];
export const ESSENCE_OF_ROLE = { Bloom: "Bloom Essence", Root: "Root Essence", Vine: "Vine Essence", Fungus: "Fungus Essence", Pod: "Pod Essence" };
export const ENERGY_TINT = { Sunlight: "#ffe08a", Moonlight: "#bcd0ff", Water: "#8fd0f0", Darkness: "#b79cff", Snowfall: "#e6f2ff" };
// One craftable essence per role; distilled from `matCost` of any of the role's
// source materials + `energyCost` of any siphoned energy -> `yield` essence.
export const ESSENCE_RECIPES = Object.entries(essenceSources).map(([role, info]) => ({
  role, result: ESSENCE_OF_ROLE[role],
  materials: info.sources.map(s => s.material), matCost: 2, energyCost: 1, yield: 1,
}));

// Reverse of ESSENCE_OF_ROLE: a crafted role Essence maps back to its role, so
// the Pot accepts it as a material stand-in when brewing (combineInPot).
export const ESSENCE_ROLE = Object.fromEntries(Object.entries(ESSENCE_OF_ROLE).map(([role, name]) => [name, role]));
// The rung-1 seed material of each role — an essence brewed in the Pot resolves
// against this stand-in material, since resolveRecipe matches on an authored
// material name (essences aren't authored materials themselves).
const ROLE_RUNG1_MATERIAL = Object.fromEntries(Object.entries(essenceSources).map(([role, info]) => [role, info.sources[0].material]));

// ---- Commercial crops -------------------------------------------------------
// Generic money/economy crops that are NOT spell materials. They plant on
// tilled soil like anything else, grow to a harvestable crop item, and serve
// two tracks: sell for gold in the shipping bin, or extract in the Pot into a
// role Essence that then fuels spell-brewing. Keyed by the harvested crop's
// item name; `seed` is the plantable item, `essenceRole` picks which Essence
// extraction yields.
export const CROPS = {
  Wheat:  { seed: "Wheat Seeds",  growDays: 3, sellPrice: 12, seedPrice: 5,  essenceRole: "Bloom" },
  Corn:   { seed: "Corn Seeds",   growDays: 3, sellPrice: 15, seedPrice: 6,  essenceRole: "Root" },
  Grapes: { seed: "Grape Seeds",  growDays: 4, sellPrice: 20, seedPrice: 9,  essenceRole: "Pod" },
};
// Plantable seed item -> the crop it grows into.
export const SEED_TO_CROP = Object.fromEntries(Object.entries(CROPS).map(([crop, c]) => [c.seed, crop]));

export class GameEngine {
  constructor() {
    this.zone = "farm";
    this.zones = {
      farm: { tiles: farmMap.map(r => r.split("")), plots: new Map() },
      cave: { tiles: caveMap.map(r => r.split("")) },
      forest: { tiles: forestMap.map(r => r.split("")) },
      town: { tiles: townMap.map(r => r.split("")) },
    };
    this.player = { x: (farmSpawn.x + 0.5) * TILE, y: (farmSpawn.y + 0.5) * TILE, facing: "down", moving: false, animFrame: 0, animTimer: 0 };
    this.moveInput = { dx: 0, dy: 0 };
    // Rung-1 starter kit — 4 of each foraged material, enough to both run the
    // discovery ritual AND actively cast the starter spells a few times before
    // needing to forage.
    // Everything is an item: spell materials, catalysts (Sunlight/Darkness/…),
    // and commercial crop seeds all live in the bag. The starter kit brews and
    // casts both tutorial spells a few times, plants a first commercial crop,
    // and sells/extracts its harvest:
    //   • Petals + Sunlight   -> brew Sprout Kiss (grow) in the Pot
    //   • Claybound Rootlets + Darkness -> brew Root Tap (mine) in the Pot
    //   • Wheat Seeds          -> plant a first money crop
    this.inventory = {
      Pot: 1,
      Petals: 4, "Claybound Rootlets": 4, "Wild Spores": 2, "Wild Seed": 2,
      Sunlight: 4, Darkness: 4, Water: 2,
      "Wheat Seeds": 3, "Corn Seeds": 2,
    };
    // Player-chosen slot arrangement for the Minecraft-style Inventory grid
    // (array of material names, index = slot; gaps allowed). Empty = auto-laid
    // out; the moment the player drags a stack it freezes into explicit slots.
    this.invOrder = [];
    // The spellbook starts almost fully unknown ("???") — spells are mostly
    // only revealed by discovering them through the planting ritual (see
    // harvestSpell()) — except the 4 starter spells (one per role that used
    // to be tool-gated), pre-known so till/mine/spray/draw-energy are usable
    // from the very first click. See STARTER_SPELL_IDS in spellSystem.js.
    this.knownSpells = new Set(STARTER_SPELL_IDS);
    this.wandIndex = 0;
    // The Wand: fixed row of equipped spell IDs (null = empty). Pre-filled with
    // the 4 starter spells; newly learned spells auto-equip into the first empty
    // slot (see harvestSpell). Edited in the Inventory's Wand tab (equipWand /
    // moveWandSlot / unequipWand). Spells are equipment, never items.
    this.wand = new Array(WAND_SLOTS).fill(null);
    STARTER_SPELL_IDS.forEach((id, i) => { if (i < WAND_SLOTS) this.wand[i] = id; });
    // The item hotbar: a fixed row of MATERIAL names (null = empty) drawn from
    // the bag. Pre-filled with the starter seeds; new seed materials drop into
    // the first empty slot (see addItem). Clicking a slot selects that material
    // for planting (selectMaterial).
    this.itemHotbar = new Array(ITEM_HOTBAR).fill(null);
    // Prefill with seeds/materials only — the Pot (a tool item) and catalysts
    // (spent in the Pot panel, not planted) don't belong in the planting hotbar.
    Object.keys(this.inventory)
      .filter(name => name !== "Pot" && !ENERGY_TYPES.includes(name))
      .forEach((name, i) => { if (i < ITEM_HOTBAR) this.itemHotbar[i] = name; });
    // The material currently "held" for planting — selected by clicking a
    // chip in the materials bar/inventory, the same way a hotbar slot picks
    // a tool. Cleared once it's planted.
    this.selectedMaterial = null;
    // The energy item (Sunlight/Water/…) currently chosen to release onto a
    // waiting seed in the planting ritual — picked by clicking an energy pill in
    // the HUD reserve strip. Energy is now carried as inventory items (extracted
    // from the wild by a Vine spell), so this is just "which reserve to spend."
    this.selectedEnergy = null;
    // The Pot is a held item; its combine panel opens on demand (C / HUD button),
    // same engine-flag idiom as shopOpen/questBoardOpen. No world tile.
    this.potOpen = false;
    this.maxRungUnlocked = 1;
    this.haulerActive = false;
    // Town shop (Millbrook Town's only function) — toggled by clicking the
    // "m" shop-counter tile, same boolean-flag idiom as haulerActive.
    this.shopOpen = false;
    // Single equippable artifact slot, sourced from rung-4/5 harvests — a
    // real "proper item" with a passive effect, distinct from stackable
    // materials. See ARTIFACTS below.
    this.artifact = null;
    // Explicit win/completion state: every one of the 40 authored spells
    // discovered. Set once in harvestSpell() and never cleared.
    this.completed = false;
    // Purely cosmetic echo of whatever just happened to a plot (seed
    // planted / essence sprayed / energy released / result) — never blocks
    // input, unlike the old menu-driven ritual. See render.js: drawRitualEffect.
    this.plotEffect = null;
    // Transient visual juice — floating "+N" text and little particle bursts
    // spawned by world actions (till dust, mine chips, forage/harvest/sell
    // gains, blight cleanse). Purely cosmetic, advanced in updateEffects() and
    // drawn in render.js (world space, so they scroll with the camera).
    this.effects = [];
    // Cosmetic-only game-feel state, both read live by the render path and kept
    // OUT of getSnapshot() (they mutate every frame and never cross the bridge):
    // a timer that gates footstep dust puffs while walking, and a screen-shake
    // scalar decayed each update() and sampled by cameraOffset().
    this.footstepTimer = 0;
    this.shake = 0;
    this.nodeRespawn = new Map();
    this.rockHp = new Map();
    // ---- spell depth: active casting, mastery, discovery clues ----
    // A discovered spell is no longer a mere role-key — many now carry an active
    // ability (see spellSystem.js `cast` descriptor) fired with F. Casting costs
    // a reagent + stamina and puts the spell on a day-based cooldown. Repeated
    // use (casts + harvests) raises per-spell mastery, which cheapens/strengthens
    // the ability. All stores are plain objects/Sets kept OUT of the snapshot in
    // raw form — only cloned/derived views cross the React bridge.
    this.mastery = {};            // { [spellId]: { casts, harvests, level } }
    this.spellCooldownUntil = {}; // { [spellId]: day the spell is usable again }
    this.clues = {};              // { [spellId]: clueLevel } — progressive discovery hints
    this.revealed = new Set();    // "zone,x,y" ore veins surfaced by a prospect cast
    this.attractors = new Map();  // "x,y" -> { item, until } ranch lures that yield over days
    this.wateredToday = new Set();// "x,y" plots topped up by a water_pulse cast this day
    // Starter spells begin at mastery L1 so the very first cast reads sensibly.
    for (const id of STARTER_SPELL_IDS) this.mastery[id] = { casts: 0, harvests: 0, level: 1 };
    // Session one already shows a legible rung-1 board: every rung-1 spell's role
    // is hinted so the player has leads to chase, not a wall of "???".
    this.revealRungClues(1);
    this.day = 1;
    this.season = "Spring";
    this.gold = 0;
    // Challenge/stakes: labor (till/mine/forage) draws on a daily stamina pool.
    // Running it dry forces a rest — advanceDay()/N — which is the core
    // time-pressure loop. The delicate planting ritual costs no stamina, so you
    // can never be stranded mid-cast with an empty bar.
    this.maxStamina = 100;
    this.stamina = 100;
    // A per-day weather event surfaced from the same Water condition the spell
    // grammar already reads: "Drought" zeroes Water (streams run dry, Water
    // recipes go dormant that day), "Rain" boosts it. Rolled in advanceDay().
    this.weather = "Clear";
    // Economy depth: each Pod fruit has a market-demand multiplier that drifts
    // every day, so the same crop is worth more some days than others — timing
    // a sale matters. Rolled here and each advanceDay().
    this.demand = {};
    this.rollDemand();
    // Persistent upgrades bought with gold — real sinks that keep gold useful
    // past the material-shop. Levels here; effects applied where relevant
    // (maxStamina on purchase, grow-days in resolvePlot). See getUpgrades().
    this.upgrades = { staminaCap: 0, growth: 0 };
    // Second pillar scaffold: Millbrook's town notice board issues fetch and
    // discovery requests from the townsfolk. Fulfilling them pays gold plus
    // reputation — reputation is banked now and will gate deeper (blighted)
    // regions and premium shop stock once The Withering lands. Toggled by
    // clicking the "q" board tile. See rollQuests/getQuests/claimQuest.
    this.reputation = 0;
    this.mapOpen = false; // full-world map overlay (M) — see toggleMap/closeMap
    this.questBoardOpen = false;
    this.quests = [];
    this.questIdSeq = 1;
    this.rollQuests();
    // The Withering: a slow blight on the farmland. Each entry is keyed "x,y"
    // (farm-only for now) with the spell role that cleanses it — cure keys
    // reuse the existing role grammar, so pushing back the blight *is*
    // spell discovery. A blighted tile penalizes the maturity of any plot
    // beside it (see blightPenalty/resolvePlot), giving the pillar real teeth
    // on the farming loop. Cleansing pays gold + reputation. Static placement
    // for now (no spread sim) — see seedBlight().
    this.blight = new Map();
    this.seedBlight();
    // The shipping bin (Stardew-style): items deposited here are sold for gold
    // at the next day rollover. Keyed by item name -> quantity awaiting sale.
    this.shippingBin = {};
    this.log = [
      "Welcome! WASD/Arrows move; click an adjacent tile to act (clicking never walks you).",
      "Brew spells at the Pot (O): select a material + a catalyst in your bar, then click the Pot. Sprout Kiss (grow) and Root Tap (mine) are ready to brew.",
      "Hold a spell (press 1–6 / click a Wand slot) and press F to cast it — grow a crop, or shatter a rock in the cave.",
      "Plant crop seeds on tilled soil (T then P), then drop the harvest in the shipping bin (B) and rest (N) to sell.",
    ];
  }

  // ---------- input ----------
  // Movement is keyboard-only (WASD/Arrows) — clicking the world never moves
  // the player. This keeps "move" and "use" fully separate input channels
  // instead of overloading the mouse for both.
  setMoveInput(dx, dy) {
    this.moveInput = { dx, dy };
  }
  selectWand(i) { if (i >= 0 && i < WAND_SLOTS) this.wandIndex = i; }

  // Click a materials-bar/inventory chip to hold that item — a second click (or
  // selecting another) clears/replaces it. Any owned item can be held now; what
  // it does depends on the tile you click next: a crop seed plants on tilled
  // soil, a spell material/essence brews in the Pot (with a catalyst), a
  // harvested crop extracts to essence in the Pot, and a sellable good deposits
  // in the shipping bin.
  selectMaterial(name) {
    if (!(this.inventory[name] > 0)) { this.selectedMaterial = null; return; }
    this.selectedMaterial = this.selectedMaterial === name ? null : name;
  }

  // ---------- per-frame update ----------
  update(dt) {
    const { dx, dy } = this.moveInput;
    let vx = 0, vy = 0;
    if (dx || dy) {
      vx = dx * SPEED; vy = dy * SPEED;
      if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }
      this.player.moving = true;
    } else {
      this.player.moving = false;
    }

    if (vx > 0) this.player.facing = "right";
    else if (vx < 0) this.player.facing = "left";
    else if (vy > 0) this.player.facing = "down";
    else if (vy < 0) this.player.facing = "up";

    const nx = this.player.x + vx * dt, ny = this.player.y + vy * dt;
    if (!this.collides(nx, this.player.y)) this.player.x = nx;
    if (!this.collides(this.player.x, ny)) this.player.y = ny;

    if (this.player.moving) {
      this.player.animTimer += dt;
      if (this.player.animTimer > 0.15) { this.player.animTimer = 0; this.player.animFrame ^= 1; }
      // Footstep dust: a small puff kicked up under the player on a walk cadence.
      this.footstepTimer += dt;
      if (this.footstepTimer > 0.26) {
        this.footstepTimer = 0;
        this.spawnDust(this.player.x, this.player.y + TILE * 0.42);
      }
    } else { this.player.animFrame = 0; this.player.animTimer = 0; this.footstepTimer = 0; }

    // Screen-shake decays exponentially toward rest every frame.
    if (this.shake > 0) { this.shake *= 0.86; if (this.shake < 0.05) this.shake = 0; }

    this.checkZoneTransition();
    this.updateEffects(dt);

    // Advances the purely-cosmetic plot glow — a lingering flash left by a
    // cleanse/harvest "result" burst (the multi-step planting ritual is gone).
    if (this.plotEffect) {
      this.plotEffect.effectTime += dt;
      if (this.plotEffect.effectTime > RITUAL_RESULT_HOLD) this.plotEffect = null;
    }
  }

  collides(px, py) {
    const half = HITBOX / 2;
    const tiles = this.zones[this.zone].tiles;
    const h = tiles.length, w = tiles[0].length;
    const exits = ZONE_EXITS[this.zone] || [];
    for (const [cx, cy] of [[px - half, py - half], [px + half, py - half], [px - half, py + half], [px + half, py + half]]) {
      const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
      const ch = tiles[ty][tx];
      // A foraged-out node has vanished from the world (see draw()/advanceDay),
      // so its tile is walkable while it's waiting to regrow — otherwise the
      // player would bump an invisible plant.
      if (SOLID_TILES.has(ch) && !this.isForagedOut(tx, ty, ch)) return true;
      // A rung-gated road-mouth stays solid (bramble-blocked) until unlocked.
      const exit = exits.find(e => e.mouth.x === tx && e.mouth.y === ty);
      if (exit?.minRung && this.maxRungUnlocked < exit.minRung) return true;
    }
    return false;
  }

  // True when tile (tx,ty) holds a resource node that's currently foraged out
  // (picked and awaiting a random regrow). Such nodes render nothing and don't
  // block movement — the spot reads as empty ground until the node returns.
  isForagedOut(tx, ty, ch = this.zones[this.zone]?.tiles?.[ty]?.[tx]) {
    return !!RESOURCE_NODES[ch] && this.nodeRespawn.has(`${this.zone},${tx},${ty}`);
  }

  facingTile() {
    const offsets = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [ox, oy] = offsets[this.player.facing];
    return { x: Math.floor(this.player.x / TILE) + ox, y: Math.floor(this.player.y / TILE) + oy };
  }

  // Turns the player to face a target tile (used when a mouse click resolves
  // an action so the sprite/facing-dependent logic lines up with what was
  // actually clicked, not wherever the keyboard last pointed them).
  faceToward(tx, ty) {
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    const dx = tx - ptx, dy = ty - pty;
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) > Math.abs(dy)) this.player.facing = dx > 0 ? "right" : "left";
    else this.player.facing = dy > 0 ? "down" : "up";
  }

  checkZoneTransition() {
    // Road-mouth travel: stepping onto a mouth tile at the map edge carries the
    // player into the neighbouring region, spawning at that region's incoming
    // road-mouth (one tile inside its edge) facing inward. Spawns are never
    // themselves mouth tiles, so there's no risk of an immediate double-fire.
    const cx = Math.floor(this.player.x / TILE), cy = Math.floor(this.player.y / TILE);
    const exit = (ZONE_EXITS[this.zone] || []).find(e => e.mouth.x === cx && e.mouth.y === cy);
    if (!exit) return;
    if (exit.minRung && this.maxRungUnlocked < exit.minRung) return; // collides() already blocks this; guard just in case
    this.zone = exit.to;
    this.player.x = (exit.spawn.x + 0.5) * TILE;
    this.player.y = (exit.spawn.y + 0.5) * TILE;
    if (exit.face) this.player.facing = exit.face;
    this.player.moving = false;
    this.moveInput = { dx: 0, dy: 0 };
    this.pushLog(exit.message);
  }

  // ---------- mouse interaction ----------
  // Click (there's only one kind now — no left/right split): perform
  // whatever action the clicked tile offers — mirrors computePrompt()'s
  // tile-type branching (see performClickAction) so mouse and keyboard
  // always agree on what a tile does. This never walks the player anywhere:
  // it only fires if the tile is already adjacent (or the one you're
  // standing on), exactly like swinging a tool in Stardew. First click a
  // hotbar item to select it (or click an environment tile with nothing
  // selected, e.g. foraging), then click the environment — e.g. click
  // tilled soil to begin the planting ritual. Movement is keyboard-only
  // (WASD/Arrows); walk over, then click to use.
  handleTileAction(tx, ty) {
    const tiles = this.zones[this.zone]?.tiles;
    const tile = tiles?.[ty]?.[tx];
    if (tile === undefined) return;

    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    const dist = Math.abs(ptx - tx) + Math.abs(pty - ty);
    if (dist > 1) { this.pushLog("Too far away — move closer first."); return; }

    this.moveInput = { dx: 0, dy: 0 };
    this.faceToward(tx, ty);
    this.performClickAction(tx, ty);
  }

  // Dispatches a click on tile (x,y) to the correct contextual action, one
  // branch per tile type — deliberately mirrors computePrompt()'s structure
  // below so "what the HUD prompt says will happen" and "what a click does"
  // never drift apart.
  performClickAction(x, y) {
    const tiles = this.zones[this.zone]?.tiles;
    const tile = tiles?.[y]?.[x];
    if (tile === undefined) return;

    // A blighted farm tile is always a cure target first — intercepted ahead
    // of tilling/foraging so clicking it attempts a cleanse no matter what's
    // held (cureBlightAt checks the role match).
    if (this.zone === "farm" && this.blight.has(`${x},${y}`)) { this.cureBlightAt(x, y); return; }

    if ((this.zone === "farm" || this.zone === "forest") && RESOURCE_NODES[tile]) { this.interactAt(x, y); return; }

    if (this.zone === "farm") {
      if (tile === "B") { this.depositToBin(); return; }   // the shipping bin: deposit for sale
      if (tile === ".") { this.tillAt(x, y); return; }
      if (tile === "D") {
        const plot = this.zones.farm.plots.get(`${x},${y}`);
        if (plot?.ready) { this.interactAt(x, y); return; }  // harvest
        if (!plot?.crop) { this.plantAt(x, y); return; }     // empty tilled soil -> plant
        return; // still growing toward maturity — nothing to do yet (cast Grow to hurry it)
      }
      if (tile === "s" || tile === "k") { this.interactAt(x, y); return; }
      return;
    }
    if (this.zone === "cave" && MINE_ROCK[tile]) { this.castSpellAt(x, y); return; }
    if (this.zone === "town" && (tile === "m" || tile === "q")) { this.interactAt(x, y); return; }
  }

  // ---------- actions ----------
  // till()/plant()/interact()/cast() are the keyboard entry points — thin
  // wrappers around the parameterized *At(x,y) versions below, which
  // both the keyboard (via facingTile()) and mouse (via performClickAction)
  // share so the two input paths can never diverge in behavior.
  till() { const { x, y } = this.facingTile(); this.tillAt(x, y); }

  tillAt(x, y) {
    if (this.zone !== "farm") { this.pushLog("Only farmland can be tilled."); return; }
    const tiles = this.zones.farm.tiles;
    if (!tiles[y]?.[x] || tiles[y][x] !== ".") { this.pushLog("Can't till that."); return; }
    if (!this.spendStamina(6)) return;
    tiles[y][x] = "D";
    this.zones.farm.plots.set(`${x},${y}`, { crop: null });
    this.spawnBurst(x, y, "#8a6a44", 5);
    this.pushLog("Tilled soil. Select a crop seed and click it (or press P) to plant.");
  }

  // ---------- planting: commercial crops ----------
  // Planting is one direct action now — no ritual. Select a crop seed
  // (Wheat/Corn/Grape Seeds) and click tilled soil (or press P): it becomes a
  // growing crop that ripens over the crop's growDays. Casting a Grow spell
  // (Sprout Kiss) hurries it; harvesting yields the crop item, which sells in
  // the shipping bin or extracts to a role Essence in the Pot. Spells are NOT
  // planted anymore — they're brewed in the Pot (combineInPot).
  plant() { const { x, y } = this.facingTile(); this.plantAt(x, y); }

  plantAt(x, y) {
    if (this.zone !== "farm") { this.pushLog("Seeds only take root on farmland."); return; }
    if (this.zones.farm.tiles[y]?.[x] !== "D") { this.pushLog("Till this tile first (T)."); return; }
    const plot = this.zones.farm.plots.get(`${x},${y}`);
    if (plot?.crop) { this.pushLog("Something is already growing here."); return; }
    const seed = this.selectedMaterial;
    if (!seed || !(this.inventory[seed] > 0)) { this.pushLog("Select a crop seed in your bar first, then click tilled soil (or press P)."); return; }
    const crop = SEED_TO_CROP[seed];
    if (!crop) { this.pushLog(`${seed} isn't a crop seed — buy Wheat/Corn/Grape Seeds in town, or brew ${MATERIAL_ROLE[seed] ? "it in the Pot" : "spells in the Pot"}.`); return; }

    this.spendItem(seed, 1);
    const growDays = Math.max(1, CROPS[crop].growDays - this.upgrades.growth + this.blightPenalty(x, y));
    this.zones.farm.plots.set(`${x},${y}`, { crop, plantDay: this.day, matureDay: this.day + growDays, ready: false });
    if (!(this.inventory[seed] > 0)) this.selectedMaterial = null;
    this.spawnBurst(x, y, "#6ea24a", 5);
    this.pushLog(`Planted ${crop} — ripe on day ${this.day + growDays}. Cast a Grow spell (F) to hurry it.`);
  }

  // ---------- the Pot: brew a spell, or extract essence from a crop ----------
  // The Pot is a held item — pressing C (or the HUD Pot button) opens its combine
  // panel (potOpen), a Minecraft-style item GUI with two explicit slots so the
  // material and the catalyst can never be confused for each other:
  //   • [material] + [catalyst] -> brew a spell via resolveRecipe. Success
  //     discovers the spell and holds it in hand (auto-equipped to the Wand);
  //     both inputs are consumed.
  //   • a harvested commercial crop -> extract it into its role Essence.
  openPot() {
    if (!(this.inventory.Pot > 0)) { this.pushLog("You don't have a Pot to brew in."); return; }
    this.potOpen = true;
  }
  closePot() { this.potOpen = false; }
  togglePot() { if (this.potOpen) this.closePot(); else this.openPot(); }

  // Brew a spell from an explicit material + catalyst (both passed from the Pot
  // panel, so there's no ambiguity about which selection is which).
  combineInPot(material, catalyst) {
    if (!material || !(this.inventory[material] > 0)) { this.pushLog("Pick a material to brew with."); return; }
    // A commercial crop -> extract its essence instead of brewing.
    if (CROPS[material]) { this.extractEssence(material); return; }

    const role = MATERIAL_ROLE[material] || ESSENCE_ROLE[material];
    if (!role) { this.pushLog(`${material} can't be brewed in the Pot — it isn't a spell material.`); return; }
    if (!catalyst || !(this.inventory[catalyst] > 0)) { this.pushLog("Pick a catalyst (Sunlight/Darkness/Water/…) to bind the brew."); return; }
    // Essences resolve against their role's authored rung-1 material stand-in.
    const recipeMaterial = MATERIAL_ROLE[material] ? material : ROLE_RUNG1_MATERIAL[role];
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    const conditions = this.getPlotConditions(ptx, pty);
    const outcome = resolveRecipe({ role, material: recipeMaterial, catalyst }, conditions);

    // Both success and failure consume the inputs (the Pot "casts" either way).
    this.spendItem(material, 1);
    this.spendItem(catalyst, 1);
    if (this.selectedMaterial === material && !(this.inventory[material] > 0)) this.selectedMaterial = null;
    if (!(this.inventory[catalyst] > 0)) this.selectedEnergy = null;

    if (outcome.type === "success") {
      const spell = outcome.spell;
      const isNew = !this.knownSpells.has(spell.id);
      this.knownSpells.add(spell.id);
      this.autoEquipWand(spell.id);
      this.wandIndex = Math.max(0, this.wand.indexOf(spell.id)); // hold the fresh spell in hand
      this.bumpMastery(spell.id, "harvest");
      if (isNew) { this.clues[spell.id] = 3; this.tryMasteryRungUnlock(); }
      this.spawnSpark(ptx, pty, "#c9a6ff", 8);
      this.pushLog(isNew ? `Brewed a new spell — ${spell.name}! It's in your hand; press F to cast it.` : `Brewed ${spell.name} — holding it in hand. Press F to cast.`);
      if (isNew && this.knownSpells.size === spells.length && !this.completed) {
        this.completed = true; this.pushLog("★ Every spell discovered — the grimoire is complete! ★");
      }
    } else {
      if (outcome.type === "dormant") this.pushLog(`The brew went dormant: ${outcome.reason}`);
      else if (outcome.type === "fizzle") this.pushLog(`Fizzle: ${outcome.reason}`);
      else this.pushLog("Uncharted combination — the Pot brewed nothing.");
      this._nearMissClue({ role, material: recipeMaterial, catalyst });
    }
  }

  // Extract a harvested commercial crop into its role Essence — a Pot material
  // stand-in that fuels spell-brewing (see combineInPot). This is the bridge
  // from the money/crop track into the spell track.
  extractEssence(crop) {
    if (!CROPS[crop] || !(this.inventory[crop] > 0)) { this.pushLog(`No ${crop} to extract.`); return; }
    const essence = ESSENCE_OF_ROLE[CROPS[crop].essenceRole];
    this.spendItem(crop, 1);
    if (!(this.inventory[crop] > 0)) this.selectedMaterial = null;
    this.addItem(essence, 1);
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    this.spawnFloat(ptx, pty, `+1 ${essence}`, "#c9a6ff");
    this.pushLog(`Extracted ${crop} into ${essence} — brew it with a catalyst in the Pot.`);
  }

  // What energy the wild yields to a siphon (G) right here, right now, and
  // how much per draw. Mirrors the player's mental model:
  //   • Water    — a stream/water tile (any zone), or anywhere when it's raining.
  //   • Darkness — anywhere in the dark underground (the cave).
  //   • Moonlight— anywhere in the moonlit Wildwood (the forest).
  //   • Snowfall — outdoors (farm/town) in Winter, i.e. when it's snowing.
  //   • Sunlight — outdoors (farm/town) otherwise; the yield ("level of sun")
  //     rises in Summer and under a harsh Drought sky, dips in Autumn.
  energyFromConditions(x, y) {
    const tile = this.zones[this.zone]?.tiles?.[y]?.[x];
    const zone = this.zone, season = this.season, weather = this.weather;
    if (tile === "~") return { energy: "Water", amount: 3 };
    if (weather === "Rain") return { energy: "Water", amount: 2 };
    if (zone === "cave") return { energy: "Darkness", amount: 2 };
    if (zone === "forest") return { energy: "Moonlight", amount: 2 };
    if (zone === "farm" || zone === "town") {
      if (season === "Winter") return { energy: "Snowfall", amount: 2 };
      const sun = weather === "Drought" ? 3 : season === "Summer" ? 3 : season === "Autumn" ? 1 : 2;
      return { energy: "Sunlight", amount: sun };
    }
    return null;
  }

  // The Vine "energy" spell: draw the ambient energy of the moment into your
  // reserves as a carryable item. Costs a little stamina so it can't be spammed.
  extractEnergyAt(x, y) {
    const res = this.energyFromConditions(x, y);
    if (!res) { this.pushLog("No energy to draw here — find a stream, or wait for the weather to turn."); return; }
    const cost = 2;
    if (this.stamina < cost) { this.pushLog("Too worn out to channel energy — rest (N) to recover."); return; }
    if ((this.inventory[res.energy] || 0) >= MAX_STACK) { this.pushLog(`Your ${res.energy} reserve is full.`); return; }
    this.stamina -= cost;
    this.addItem(res.energy, res.amount);
    this.spawnFloat(x, y, `+${res.amount} ${res.energy}`, ENERGY_TINT[res.energy] || "#fff2c0");
    this.spawnSpark(x, y, ENERGY_TINT[res.energy] || "#fff2c0", 8);
    this.pushLog(`Drew ${res.amount} ${res.energy} from the wild.`);
  }

  // Pick which catalyst reserve the Pot will brew with (HUD strip).
  selectEnergy(name) {
    if (!ENERGY_TYPES.includes(name)) return;
    if (!(this.inventory[name] > 0)) { this.selectedEnergy = null; return; }
    this.selectedEnergy = this.selectedEnergy === name ? null : name;
  }

  // ---------- the shipping bin (Stardew-style) ----------
  // Deposit the held item into the bin (world tile "B"); everything in it is
  // sold for gold at the next day rollover (advanceDay). Sellable = commercial
  // crops, Pod fruit, or mined/foraged materials.
  sellValue(name) {
    if (CROPS[name]) return CROPS[name].sellPrice;
    const fruit = spells.find(s => s.role === "Pod" && s.name === name);
    if (fruit) return this.fruitPrice(fruit);
    const rung = Object.entries(materialsByRung).find(([, names]) => names.includes(name))?.[0];
    if (rung) return Number(rung) * 3;
    return 0;
  }
  depositToBin() {
    const item = this.selectedMaterial;
    if (!item || !(this.inventory[item] > 0)) { this.pushLog("Select an item to ship, then click the bin."); return; }
    if (this.sellValue(item) <= 0) { this.pushLog(`${item} has no market value — the bin won't take it.`); return; }
    const qty = this.inventory[item];
    delete this.inventory[item];
    this.shippingBin[item] = (this.shippingBin[item] || 0) + qty;
    this.selectedMaterial = null;
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    this.spawnFloat(ptx, pty, `shipped ${qty} ${item}`, "#e9c14a");
    this.pushLog(`Shipped ${qty} ${item} — sells for ${this.sellValue(item) * qty}g when you rest (N).`);
  }
  // Sell everything in the bin; called at day rollover. Returns gold earned.
  sellShippingBin() {
    let earned = 0, count = 0;
    for (const [name, qty] of Object.entries(this.shippingBin)) { earned += this.sellValue(name) * qty; count += qty; }
    this.shippingBin = {};
    if (earned) this.gold += earned;
    return { earned, count };
  }

  getPlotConditions(x, y) {
    const base = { ...seasonalConditions[this.season] };
    if (this.isNearStream(x, y)) base.Water = Infinity;
    // Moonspore Talisman artifact eases every seasonal requirement by 1 —
    // implemented as a +1 boost to the conditions offered rather than
    // touching spellRequirements()/resolveRecipe() (shared with the separate
    // Spellbook Explorer app), so the shared grammar stays untouched.
    if (this.artifact === "Moonspore") for (const k of Object.keys(base)) if (base[k] !== Infinity) base[k] += 1;
    // Weather overrides Water last: a drought dries even a streamside plot to
    // zero (Water recipes fizzle dormant that day); rain tops it up.
    if (this.weather === "Drought") base.Water = 0;
    else if (this.weather === "Rain" && base.Water !== Infinity) base.Water += 2;
    // Dewbind aura (emergent farming): an adjacent Dewbind crop keeps this plot
    // watered — applied after weather, so it waters even through a drought.
    if (base.Water !== Infinity && this.hasAdjacentCrop(x, y, "Dewbind")) base.Water += 3;
    // A water_pulse cast (Rain Petal) tops up this exact plot for the day —
    // also after weather, so it lets a Water recipe resolve during a drought.
    if (base.Water !== Infinity && this.wateredToday.has(`${x},${y}`)) base.Water += 3;
    return base;
  }

  isNearStream(x, y) {
    const tiles = this.zones.farm.tiles;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (tiles[y + oy]?.[x + ox] === "~") return true;
    }
    return false;
  }

  interact() { const { x, y } = this.facingTile(); this.interactAt(x, y); }

  interactAt(x, y) {
    const tiles = this.zones[this.zone]?.tiles;
    const tile = tiles?.[y]?.[x];
    if (tile === undefined) return;

    if ((this.zone === "farm" || this.zone === "forest") && RESOURCE_NODES[tile]) {
      const key = `${this.zone},${x},${y}`;
      if (this.nodeRespawn.has(key)) { this.pushLog("Nothing here right now — it will regrow."); return; }
      if (!this.spendStamina(4)) return;
      const node = RESOURCE_NODES[tile];
      this.addItem(node.material, 1);
      // Store the day it was picked; it now vanishes from the world and regrows
      // on a random per-day roll (see advanceDay), not a fixed timer.
      this.nodeRespawn.set(key, this.day);
      this.spawnFloat(x, y, `+1 ${node.material}`, "#cfe8a0");
      this.spawnBurst(x, y, "#6ea24a", 4);
      this.pushLog(`Foraged ${node.material}.`);
      return;
    }

    if (this.zone === "farm") {
      if (tile === "B") { this.depositToBin(); return; }
      if (tile === "D") {
        const plot = this.zones.farm.plots.get(`${x},${y}`);
        if (plot?.ready && plot.crop) {
          const crop = plot.crop;
          // Harvest "pop" — a green burst + bright sparks as the crop is pulled.
          this.spawnBurst(x, y, "#8fd46a", 8);
          this.spawnSpark(x, y, "#e6ffb0", 5);
          const total = 1 + (plot.mutated || 0);
          this.addItem(crop, total);
          this.spawnFloat(x, y, `+${total} ${crop}`, "#f0c96a");
          this.pushLog(`Harvested ${total} ${crop}. Ship it (B) to sell, or extract it in the Pot (O) for Essence.${plot.mutated ? " Mutation bonus!" : ""}`);
          // Return the soil to plain tilled earth, ready to replant.
          this.zones.farm.plots.set(`${x},${y}`, { crop: null });
          return;
        }
        if (plot?.crop) this.pushLog(`Still growing — ripe on day ${plot.matureDay}. Cast a Grow spell (F) to hurry it.`);
        else this.pushLog("Select a crop seed and press P (or click) to plant.");
        return;
      }
      if (tile === "s") { this.tryRefine(); return; }
      if (tile === "k") { this.trySell(); return; }
      return;
    }
    if (this.zone === "town") {
      if (tile === "m") { this.shopOpen = !this.shopOpen; this.pushLog(this.shopOpen ? "Opened the shop." : "Closed the shop."); return; }
      if (tile === "q") { this.questBoardOpen = !this.questBoardOpen; this.pushLog(this.questBoardOpen ? "Reading the town notice board." : "Stepped away from the notice board."); return; }
      this.pushLog("Nothing to interact with here.");
      return;
    }
    if (this.zone === "cave") { this.pushLog("Nothing to interact with here — try casting a spell (F)."); return; }
    this.pushLog("Nothing to interact with here.");
  }

  closeShop() { this.shopOpen = false; }

  // Gold sink #1: buy rung-2+ materials outright, priced by rarity (reuses
  // materialsByRung rather than a hand-authored parallel price list) —
  // skips foraging/mining/refining grind to accelerate spell discovery.
  getShopListings() {
    const premiumUnlocked = this.reputation >= REP_PREMIUM_GATE;
    // Commercial crop seeds are always stocked — they're the money/economy
    // track (grow → sell in the bin, or extract → essence to fuel the Pot).
    const seedListings = Object.values(CROPS).map(c => ({ name: c.seed, rung: 0, price: c.seedPrice }));
    return seedListings.concat(
      Object.entries(materialsByRung)
        .filter(([r]) => Number(r) >= 2)
        // Rung-5 stock is the rarest — gated behind town reputation so the
        // endgame seed materials reward engaging with the quest/blight pillar.
        .filter(([r]) => Number(r) < 5 || premiumUnlocked)
        .flatMap(([r, names]) => names.map(name => ({ name, rung: Number(r), price: Number(r) * Number(r) * 6 })))
    );
  }

  buyMaterial(name) {
    const listing = this.getShopListings().find(l => l.name === name);
    if (!listing) { this.pushLog(`${name} isn't for sale here.`); return; }
    if (this.gold < listing.price) { this.pushLog("Not enough gold."); return; }
    this.gold -= listing.price;
    this.addItem(name, 1);
    this.pushLog(`Bought ${name} for ${listing.price}g.`);
  }

  // Gold sink #2: pay to unlock the next rung of materials/zones early,
  // instead of waiting to naturally mature a spell at the current max rung.
  getRungUnlockPrice() { return this.maxRungUnlocked < 5 ? (this.maxRungUnlocked + 1) ** 2 * 25 : null; }

  buyRungUnlock() {
    const price = this.getRungUnlockPrice();
    if (!price) { this.pushLog("Already fully unlocked."); return; }
    if (this.gold < price) { this.pushLog("Not enough gold."); return; }
    this.gold -= price;
    this.maxRungUnlocked++;
    this.revealRungClues(this.maxRungUnlocked); // new tier reveals its spells' roles
    this.pushLog(`Paid ${price}g to unlock rung ${this.maxRungUnlocked} early.`);
  }

  harvestSpell(spell) {
    const isNew = !this.knownSpells.has(spell.id);
    this.knownSpells.add(spell.id);
    if (isNew) this.autoEquipWand(spell.id);
    // Every harvest deepens the spell's mastery — re-growing a known spell is no
    // longer a flat "matured again"; it earns progress toward cheaper, stronger casts.
    const m = this.bumpMastery(spell.id, "harvest");
    this.pushLog(isNew ? `Learned ${spell.name}!` : `${spell.name} matured again — mastery Lv ${m.level}.`);
    if (isNew) this.clues[spell.id] = 3; // a discovered spell's clues are moot; mark fully known
    if (spell.rung === this.maxRungUnlocked && this.maxRungUnlocked < 5) {
      this.maxRungUnlocked++;
      this.revealRungClues(this.maxRungUnlocked);
      this.pushLog(`New tier unlocked — rung ${this.maxRungUnlocked} materials available.`);
    }
    // Progression also flows from mastery, not just fresh discovery: once the
    // spells you already know at the current tier are well-mastered (summed
    // levels clear a threshold), the next rung opens too.
    this.tryMasteryRungUnlock();
    // The explicit win condition: every one of the 40 authored spells
    // discovered. A silent counter (knownSpells.size) becomes a celebrated
    // goal instead of just something that happens to be tracked.
    if (isNew && this.knownSpells.size === spells.length && !this.completed) {
      this.completed = true;
      this.pushLog("★ Every spell discovered — the grimoire is complete! ★");
    }
  }

  // Sum of mastery levels across known spells at the current top rung; when it
  // clears a threshold, advance the tier — mastering existing spells is a real
  // progression path alongside discovery and the gold buy.
  tryMasteryRungUnlock() {
    if (this.maxRungUnlocked >= 5) return;
    let sum = 0;
    for (const id of this.knownSpells) if (spells[id].rung === this.maxRungUnlocked) sum += this.masteryLevel(id);
    if (sum >= 6) {
      this.maxRungUnlocked++;
      this.revealRungClues(this.maxRungUnlocked);
      this.pushLog(`Your mastery of rung ${this.maxRungUnlocked - 1} spells opens rung ${this.maxRungUnlocked}!`);
    }
  }

  hasRole(role) { for (const id of this.knownSpells) if (spells[id].role === role) return true; return false; }

  tryRefine() {
    for (const recipe of REFINE_RECIPES) {
      if ((this.inventory[recipe.input] || 0) > 0 && this.hasRole(recipe.spellRole)) {
        this.inventory[recipe.input]--;
        if (this.inventory[recipe.input] <= 0) delete this.inventory[recipe.input];
        this.addItem(recipe.output, 1);
        this.pushLog(`Refined ${recipe.input} → ${recipe.output}.`);
        return;
      }
    }
    this.pushLog("Nothing to refine (need a raw material + a known Fungus spell).");
  }

  // Alloy Charm artifact (see ARTIFACTS) pays a flat gold bonus per fruit sold.
  artifactSellBonus() { return this.artifact === "Alloy" ? 1 : 0; }

  // Re-roll each Pod fruit's market demand to a fresh multiplier in [0.8,1.3].
  rollDemand() {
    const d = {};
    for (const s of spells) if (s.role === "Pod") d[s.name] = Math.round((0.8 + Math.random() * 0.5) * 100) / 100;
    this.demand = d;
  }
  // Sale price of one unit of a Pod fruit, folding in the artifact bonus and
  // today's demand multiplier (default 1 if a fruit somehow has no entry).
  fruitPrice(spell) {
    return Math.max(1, Math.round((spell.rung * 5 + this.artifactSellBonus()) * (this.demand[spell.name] ?? 1)));
  }
  // Highest-demand fruit right now, for the market prompt "tip".
  bestDemandFruit() {
    let best = null;
    for (const [name, mult] of Object.entries(this.demand)) if (!best || mult > best.mult) best = { name, mult };
    if (!best) return null;
    return { name: best.name, tag: best.mult >= 1.15 ? "high" : best.mult <= 0.9 ? "low" : "steady", mult: best.mult.toFixed(2) };
  }

  // Gold sink #3: persistent upgrades. Prices escalate with the level already
  // owned so each tier costs more than the last.
  getUpgrades() {
    return [
      { key: "staminaCap", name: "Sturdy Back", desc: "+25 max stamina", level: this.upgrades.staminaCap, maxLevel: 4, price: 40 * (this.upgrades.staminaCap + 1) },
      { key: "growth", name: "Green Thumb", desc: "Crops mature 1 day faster", level: this.upgrades.growth, maxLevel: 2, price: 80 * (this.upgrades.growth + 1) },
    ];
  }
  buyUpgrade(key) {
    const up = this.getUpgrades().find(u => u.key === key);
    if (!up) { this.pushLog(`${key} isn't an upgrade.`); return; }
    if (up.level >= up.maxLevel) { this.pushLog(`${up.name} is already maxed.`); return; }
    if (this.gold < up.price) { this.pushLog("Not enough gold."); return; }
    this.gold -= up.price;
    this.upgrades[key]++;
    if (key === "staminaCap") { this.maxStamina += 25; this.stamina += 25; }
    this.pushLog(`Upgraded ${up.name} to level ${this.upgrades[key]} for ${up.price}g.`);
  }

  // ---------- world map overlay ----------
  // A read-only atlas of every zone (M or the HUD button). Purely informational
  // — it opens/closes like the shop/board overlays (engine flag mirrored through
  // the snapshot) and never moves the player; travel is still done by walking
  // through the gate tiles.
  toggleMap() { this.mapOpen = !this.mapOpen; }
  closeMap() { this.mapOpen = false; }

  // ---------- quests (second pillar scaffold) ----------
  closeQuestBoard() { this.questBoardOpen = false; }
  countKnownRole(role) { let n = 0; for (const id of this.knownSpells) if (spells[id].role === role) n++; return n; }
  // Pod spells whose fruit the player can actually grow (must be discovered
  // first) — the only valid targets for a "deliver fruit" request.
  knownPodFruits() {
    const out = [];
    for (const id of this.knownSpells) { const s = spells[id]; if (s.role === "Pod") out.push(s); }
    return out;
  }

  // ---------- discovery clues (discovery-as-puzzle) ----------
  // Progressive hints toward undiscovered spells, revealed by engaging with the
  // world (quests, rung unlocks, near-miss experiments) rather than brute force.
  // Levels: 1 = role, 2 = rung/material family, 3 = catalyst family. Reads only
  // authored fields — never touches resolveRecipe's grammar.
  revealClue(id, upTo) {
    if (this.knownSpells.has(id)) return false;
    const cur = this.clues[id] || 0;
    if (upTo > cur) { this.clues[id] = Math.min(3, upTo); return true; }
    return false;
  }
  revealRungClues(rung) { for (const s of spells) if (s.rung === rung && !this.knownSpells.has(s.id)) this.revealClue(s.id, 1); }
  _clueBlurb(s, level) {
    if (level >= 3) return `a ${s.role} spell (rung ${s.rung}) wants ${catalystFamily(s.catalyst)}.`;
    if (level >= 2) return `an undiscovered ${s.role} spell awaits at rung ${s.rung}.`;
    return `there's an undiscovered ${s.role} spell out there.`;
  }
  // A quest reward — surface a fresh clue on a random undiscovered spell,
  // biased to advance a lead that's already been hinted.
  revealRandomClue() {
    const hinted = spells.filter(s => !this.knownSpells.has(s.id) && (this.clues[s.id] || 0) > 0 && (this.clues[s.id] || 0) < 3);
    const fresh = spells.filter(s => !this.knownSpells.has(s.id) && !(this.clues[s.id] > 0));
    const pool = (hinted.length && Math.random() < 0.6) ? hinted : (fresh.length ? fresh : hinted);
    if (!pool.length) return;
    const s = pool[Math.floor(Math.random() * pool.length)];
    const next = Math.min(3, (this.clues[s.id] || 0) + 1);
    if (this.revealClue(s.id, next)) this.pushLog(`A townsfolk's rumor: ${this._clueBlurb(s, next)}`);
  }
  // Called when a resolve fails: if the tried recipe is one field away from an
  // undiscovered authored spell, nudge its clue up — turning brute force into
  // guided narrowing.
  _nearMissClue(recipe) {
    const near = spells.find(s => !this.knownSpells.has(s.id) && s.role === recipe.role && (s.material === recipe.material || s.catalyst === recipe.catalyst));
    if (!near) return;
    const next = Math.min(3, (this.clues[near.id] || 0) + 1);
    if (this.revealClue(near.id, next)) this.pushLog(`So close — ${this._clueBlurb(near, next)}`);
  }

  // Fill the board up to three open requests. Deliver-quests only appear once
  // the player knows a Pod spell to grow the fruit; discovery-quests avoid
  // roles the player has already fully discovered (would be unfulfillable).
  rollQuests() {
    const roles = ["Bloom", "Root", "Vine", "Fungus", "Pod"];
    let guard = 0;
    while (this.quests.length < 3 && guard++ < 40) {
      const pods = this.knownPodFruits();
      const wantDeliver = pods.length > 0 && Math.random() < 0.5;
      if (wantDeliver) {
        const fruit = pods[Math.floor(Math.random() * pods.length)];
        if (this.quests.some(q => q.kind === "deliver" && q.target === fruit.name)) continue;
        const qty = 2 + Math.floor(Math.random() * 2); // 2-3
        this.quests.push({ id: this.questIdSeq++, kind: "deliver", target: fruit.name, qty, reward: { gold: qty * fruit.rung * 6, rep: fruit.rung } });
      } else {
        const role = roles[Math.floor(Math.random() * roles.length)];
        if (this.quests.some(q => q.kind === "discover" && q.target === role)) continue;
        const total = spells.filter(s => s.role === role).length;
        if (this.countKnownRole(role) >= total) continue; // nothing left to discover in this role
        this.quests.push({ id: this.questIdSeq++, kind: "discover", target: role, baseline: this.countKnownRole(role), reward: { gold: 30, rep: 3 } });
      }
    }
  }

  // A request is done when its condition is met against current live state —
  // pure derivation, so it re-checks correctly however the player got there
  // (harvested/bought fruit, discovered a spell by any route).
  questDone(q) {
    if (q.kind === "deliver") return (this.inventory[q.target] || 0) >= q.qty;
    return this.countKnownRole(q.target) > q.baseline;
  }
  getQuests() {
    return this.quests.map(q => ({
      id: q.id, kind: q.kind, target: q.target, qty: q.qty ?? null,
      have: q.kind === "deliver" ? (this.inventory[q.target] || 0) : (this.countKnownRole(q.target) > q.baseline ? 1 : 0),
      reward: q.reward, done: this.questDone(q),
    }));
  }

  claimQuest(id) {
    const q = this.quests.find(x => x.id === id);
    if (!q) return;
    if (!this.questDone(q)) { this.pushLog("That request isn't fulfilled yet."); return; }
    if (q.kind === "deliver") {
      this.inventory[q.target] -= q.qty;
      if (this.inventory[q.target] <= 0) delete this.inventory[q.target];
    }
    this.gold += q.reward.gold;
    this.reputation += q.reward.rep;
    this.quests = this.quests.filter(x => x.id !== q.id);
    this.spawnFloat(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE), `+${q.reward.gold}g +${q.reward.rep} rep`, "#e9c14a");
    this.pushLog(`Fulfilled a town request — +${q.reward.gold}g, +${q.reward.rep} rep.`);
    this.revealRandomClue(); // townsfolk gratitude comes with a discovery lead
    this.rollQuests();
  }

  // ---------- The Withering (blight) ----------
  // Hand-placed starter blight on open farmland — three patches, each cured by
  // a different role so pushing them all back requires discovering across the
  // grammar. Fungus is the thematic mender (see Moldmend); Bloom and Vine keep
  // it from being single-role. Guards against landing on non-grass tiles.
  seedBlight() {
    const seeds = [
      { x: 13, y: 10, role: "Fungus" },
      { x: 8, y: 10, role: "Bloom" },
      { x: 19, y: 9, role: "Vine" },
    ];
    const tiles = this.zones.farm.tiles;
    for (const s of seeds) {
      if (tiles[s.y]?.[s.x] !== ".") continue; // only creep over plain grass
      this.blight.set(`${s.x},${s.y}`, { cure: { role: s.role }, intensity: 1 });
    }
  }

  // Count blighted tiles orthogonally adjacent to (x,y) — each one adds a day
  // to a plot's maturity, so the blight visibly drags on nearby crops.
  blightPenalty(x, y) {
    let n = 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.blight.has(`${x + ox},${y + oy}`)) n++;
    return n;
  }

  // ---------- emergent farming (auras + cross-pollination) ----------
  // Is a growing/mature crop of the named spell orthogonally adjacent to
  // (x,y)? Powers the aura spells the spellbook describes but never coded:
  // Sunblossom (neighbors mature faster) and Dewbind (neighbors auto-watered).
  hasAdjacentCrop(x, y, spellName) {
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = this.zones.farm.plots.get(`${x + ox},${y + oy}`);
      if (p?.planted?.outcome?.spell?.name === spellName) return true;
    }
    return false;
  }
  // Cross-pollination: is there an adjacent growing/mature crop of a *different*
  // role? If so the new plot fruits a little richer (see resolvePlot/harvest).
  hasAdjacentDifferentRole(x, y, role) {
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = this.zones.farm.plots.get(`${x + ox},${y + oy}`);
      const r = p?.planted?.outcome?.spell?.role;
      if (r && r !== role) return true;
    }
    return false;
  }

  // Cleanse a blighted tile by casting a role-matching spell on it. The clicked
  // tile is intercepted before any till/forage/draw action (see
  // performClickAction), so a blighted tile is always a cure target first.
  cureBlightAt(x, y) {
    const b = this.blight.get(`${x},${y}`);
    if (!b) return;
    const spell = this.getSelectedSpell();
    if (!spell) { this.pushLog("Equip a spell to cleanse the blight."); return; }
    if (spell.role !== b.cure.role) { this.pushLog(`The Withering resists — only a ${b.cure.role} spell can cleanse this patch.`); return; }
    if (!this.spendStamina(6)) return;
    this.blight.delete(`${x},${y}`);
    this.gold += 8;
    this.reputation += 2;
    this.spawnFloat(x, y, "+8g +2 rep", "#c48fd9");
    this.spawnBurst(x, y, "#b278c8", 8);
    this.pushLog(`Cleansed the Withering with ${spell.name}! +8g, +2 rep.`);
    // Reuse the ritual's success glow for satisfying feedback (tile coords).
    this.plotEffect = { target: { x, y }, step: "result", role: spell.role, catalyst: spell.catalyst, outcome: { type: "success" }, effectTime: 0 };
  }

  trySell() {
    const fruitSpells = spells.filter(s => s.role === "Pod");
    let sold = 0, earned = 0;
    for (const s of fruitSpells) {
      const have = this.inventory[s.name] || 0;
      if (have > 0) { earned += have * this.fruitPrice(s); sold += have; delete this.inventory[s.name]; }
    }
    // Refined/rung-3+ raw materials aren't spell fruit, but they shouldn't be
    // dead weight once they're not needed as plantable seed material either —
    // liquidate anything that isn't currently plantable at a smaller flat
    // rate, same market trip as selling fruit.
    const plantable = new Set(this.getPlantableMaterials());
    const podNames = new Set(fruitSpells.map(s => s.name));
    let matSold = 0, matEarned = 0;
    for (const [name, have] of Object.entries(this.inventory)) {
      if (podNames.has(name) || plantable.has(name) || have <= 0) continue;
      const rung = Object.entries(materialsByRung).find(([, names]) => names.includes(name))?.[0];
      if (!rung) continue; // unknown item (e.g. an artifact material) — leave it alone
      matEarned += have * Number(rung) * 3; matSold += have;
      delete this.inventory[name];
    }
    earned += matEarned; sold += matSold;
    if (sold) {
      this.gold += earned;
      this.spawnFloat(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE), `+${earned}g`, "#e9c14a");
      this.pushLog(`Sold ${sold} item${sold === 1 ? "" : "s"} for ${earned}g at the market.`);
    } else this.pushLog("Nothing sellable yet.");
  }

  cast() { const { x, y } = this.facingTile(); this.castAt(x, y); }

  castAt(x, y) {
    const spell = this.getSelectedSpell();
    if (!spell) { this.pushLog("Nothing equipped — press 1–6 or click a Wand slot to select a spell."); return; }
    if (this.zone === "cave") {
      const tile = this.zones.cave.tiles[y]?.[x];
      const rock = MINE_ROCK[tile];
      // Any known Root-role spell works as a mining implement.
      if (rock && spell.role === "Root") { this.mineRock(x, y, spell.name); return; }
      this.pushLog(rock ? `${spell.name} can't affect this rock — equip a Root spell.` : "Nothing to mine here.");
      return;
    }
    if (this.zone === "farm") {
      const tile = this.zones.farm.tiles[y]?.[x];
      if (tile === "p" && spell.role === "Vine") {
        this.haulerActive = !this.haulerActive;
        this.pushLog(this.haulerActive ? `${spell.name} activated the hauler line.` : "Hauler line deactivated.");
        return;
      }
    }
    this.pushLog("Nothing responds to that here.");
  }

  // Shared mining resolution — any known Root-role spell can call this (see
  // castAt above), so there's exactly one place that reduces rock HP and
  // pays out materials.
  mineRock(x, y, label) {
    const rock = MINE_ROCK[this.zones.cave.tiles[y]?.[x]];
    if (!rock) return;
    if (!this.spendStamina(8)) return;
    const key = `${x},${y}`;
    const hp = (this.rockHp.get(key) ?? rock.hp) - 1;
    if (hp <= 0) {
      this.zones.cave.tiles[y][x] = ".";
      this.rockHp.delete(key);
      const mat = rock.materials[Math.floor(Math.random() * rock.materials.length)];
      this.addItem(mat, 1);
      this.spawnFloat(x, y, `+1 ${mat}`, "#dcc9a0");
      this.spawnBurst(x, y, "#9a8c74", 7);
      this.spawnSpark(x, y, "#ffe6a0", 6);
      this.pushLog(`Mined through with ${label}! +1 ${mat}.`);
    } else {
      this.rockHp.set(key, hp);
      this.spawnBurst(x, y, "#9a8c74", 3);
      this.spawnSpark(x, y, "#e8d0a0", 3);
      this.pushLog(`Cracked the rock with ${label} (${hp} hp left).`);
    }
  }

  // ---------- active spell casting (F) ----------
  // The equipped spell's own ability, fired on the facing/target tile. This is
  // the "spells actually do something unique" layer: a discovered spell that
  // carries a `cast` descriptor (spellSystem.js index 8) dispatches to a
  // handler below; a spell without one falls back to the legacy castAt (mine /
  // hauler), so nothing that worked before breaks. Costs a reagent + stamina
  // and sets a cooldown, all scaled by mastery.
  castSpell() { const { x, y } = this.facingTile(); this.castSpellAt(x, y); }

  castSpellAt(x, y) {
    const spell = this.getSelectedSpell();
    if (!spell) { this.pushLog("Nothing equipped — press 1–6 or click a Wand slot to select a spell."); return; }
    if (!spell.cast) { this.castAt(x, y); return; } // legacy fallback (mine / hauler toggle)

    const cdUntil = this.spellCooldownUntil[spell.id] || 0;
    if (this.day < cdUntil) { this.pushLog(`${spell.name} is recharging — ready on day ${cdUntil}.`); return; }

    const mods = this.masteryMods(spell.id);
    const c = spell.cast.cost || {};
    const staminaCost = Math.max(0, Math.round((c.stamina || 0) * mods.costMult));
    if (staminaCost && this.stamina < staminaCost) { this.pushLog("Too worn out to cast — rest (N) to recover."); return; }

    const ctx = { x, y, spell, radius: spell.cast.radius || 0, power: (spell.cast.power || 0) + mods.powerAdd };
    let ok = false;
    switch (spell.cast.kind) {
      case "grow_pulse": ok = this._castGrowPulse(ctx); break;
      case "water_pulse": ok = this._castWaterPulse(ctx); break;
      case "haul_deliver": ok = this._castHaulDeliver(ctx); break;
      case "cleanse": ok = this._castCleanse(ctx); break;
      case "attract": ok = this._castAttract(ctx); break;
      case "prospect": ok = this._castProspect(ctx); break;
      case "refine_cast": ok = this._castRefine(ctx); break;
      case "mine_burst": ok = this._castMineBurst(ctx); break;
      case "mutate": ok = this._castMutate(ctx); break;
      default: this.pushLog(`${spell.name} can't be cast yet.`); return;
    }
    if (!ok) return; // the handler already logged why; charge nothing

    // Universal cast feedback — a burst of role-tinted sparks at the target so
    // every successful cast reads as a magical "impact" on top of each handler's
    // own effect.
    const ROLE_SPARK = { Root: "#f0c48a", Vine: "#b6e88a", Fungus: "#d8a6e0", Pod: "#f5c46a" };
    this.spawnSpark(x, y, ROLE_SPARK[spell.role] || "#fff2c0", 7);

    if (staminaCost) this.stamina = Math.max(0, this.stamina - staminaCost);
    const cd = Math.max(0, Math.round((c.cooldown || 0) * mods.cooldownMult));
    if (cd) this.spellCooldownUntil[spell.id] = this.day + cd;
    this.bumpMastery(spell.id, "cast");
    this.tryMasteryRungUnlock();
  }

  // Reagent resolution — "self" = the spell's own material, "role" = any owned
  // material of the spell's role, else an explicit item name. Returns the actual
  // inventory item that would be spent, or null if none is available.
  reagentName(spec, spell) {
    if (!spec) return null;
    const essence = ESSENCE_OF_ROLE[spell.role];
    if (spec === "self") {
      if (this.inventory[spell.material] > 0) return spell.material;
      // A crafted role Essence stands in for the spell's own material.
      if (essence && this.inventory[essence] > 0) return essence;
      return null;
    }
    if (spec === "role") {
      // Prefer the crafted essence — the whole point of distilling it.
      if (essence && this.inventory[essence] > 0) return essence;
      for (const name of Object.keys(this.inventory)) if (this.inventory[name] > 0 && MATERIAL_ROLE[name] === spell.role) return name;
      return null;
    }
    return this.inventory[spec] > 0 ? spec : null;
  }
  reagentLabel(spec, spell) {
    if (spec === "self") return `${spell.material} or ${ESSENCE_OF_ROLE[spell.role]}`;
    if (spec === "role") return `${spell.role}-family material or ${ESSENCE_OF_ROLE[spell.role]}`;
    return spec;
  }
  consumeReagent(spec, spell) {
    const name = this.reagentName(spec, spell);
    if (!name) return;
    this.inventory[name]--;
    if (this.inventory[name] <= 0) delete this.inventory[name];
  }

  // ---------- mastery / leveling ----------
  // Uses (casts + harvests) climb a threshold ladder; level in turn cheapens
  // cost, adds power, and shortens cooldown. Called from castSpellAt and
  // harvestSpell so both wielding and re-growing a spell deepen mastery.
  bumpMastery(id, kind) {
    const m = this.mastery[id] || (this.mastery[id] = { casts: 0, harvests: 0, level: 1 });
    if (kind === "cast") m.casts++; else m.harvests++;
    const uses = m.casts + m.harvests;
    let lvl = 1;
    for (const [i, t] of [3, 8, 20].entries()) if (uses >= t) lvl = i + 2;
    m.level = lvl;
    return m;
  }
  masteryLevel(id) { return this.mastery[id]?.level || 1; }
  masteryMods(id) {
    const lvl = this.masteryLevel(id);
    return {
      costMult: lvl >= 2 ? 0.8 : 1,      // L2: -20% reagent/stamina
      powerAdd: lvl >= 3 ? 1 : 0,        // L3: +1 effect power
      cooldownMult: lvl >= 4 ? 0.6 : 1,  // L4: -40% cooldown
    };
  }

  // ---------- cast handlers (each returns true on success, false + a log on a
  // bad target so no cost is spent) ----------
  _castGrowPulse({ x, y, power }) {
    const plot = this.zones.farm.plots.get(`${x},${y}`);
    if (this.zone !== "farm" || !plot?.crop || plot.ready) { this.pushLog("Aim a growth pulse at a crop that's still growing."); return false; }
    const p = Math.max(1, power || 1);
    plot.matureDay = Math.max(this.day, plot.matureDay - p);
    if (this.day >= plot.matureDay) plot.ready = true;
    this.spawnBurst(x, y, "#8fd46a", 6);
    this.spawnFloat(x, y, `+${p}d growth`, "#bff09a");
    this.pushLog(plot.ready ? `Growth pulse ripened the crop — ready to harvest!` : `Growth pulse hurried the crop by ${p} day${p === 1 ? "" : "s"}.`);
    return true;
  }
  _castWaterPulse({ x, y }) {
    if (this.zone !== "farm") { this.pushLog("Water pulses only fall on farmland."); return false; }
    if (this.zones.farm.tiles[y]?.[x] !== "D") { this.pushLog("Aim a water pulse at tilled soil or a planted plot."); return false; }
    this.wateredToday.add(`${x},${y}`);
    this.spawnBurst(x, y, "#5aa9e0", 6);
    this.spawnFloat(x, y, "watered", "#9fd0f0");
    this.pushLog("Soaked the plot — Water runs high here today (even through drought).");
    return true;
  }
  _castHaulDeliver({ power }) {
    const limit = 3 + (power || 0);
    let remaining = limit, sold = 0, earned = 0;
    for (const s of spells.filter(sp => sp.role === "Pod")) {
      if (remaining <= 0) break;
      const have = this.inventory[s.name] || 0;
      if (have > 0) { const take = Math.min(have, remaining); this.inventory[s.name] -= take; if (this.inventory[s.name] <= 0) delete this.inventory[s.name]; earned += take * this.fruitPrice(s); sold += take; remaining -= take; }
    }
    if (!sold) { this.pushLog("No fruit on hand to haul to market."); return false; }
    this.gold += earned;
    this.spawnFloat(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE), `+${earned}g`, "#e9c14a");
    this.pushLog(`Hauled ${sold} fruit straight to market for ${earned}g.`);
    return true;
  }
  _castCleanse({ x, y }) {
    const b = this.blight.get(`${x},${y}`);
    if (!b) { this.pushLog("No Withering there to cleanse."); return false; }
    // A dedicated cleansing cast purges ANY blight role (its edge over the
    // passive, role-locked cure in cureBlightAt) — justifying the reagent cost.
    this.blight.delete(`${x},${y}`);
    this.gold += 8; this.reputation += 2;
    this.spawnFloat(x, y, "+8g +2 rep", "#c48fd9");
    this.spawnBurst(x, y, "#b278c8", 8);
    this.pushLog("Cleansing cast purged the Withering! +8g, +2 rep.");
    this.plotEffect = { target: { x, y }, step: "result", role: "Fungus", catalyst: "Water", outcome: { type: "success" }, effectTime: 0 };
    return true;
  }
  _castAttract({ x, y, spell }) {
    if (this.zone !== "farm") { this.pushLog("Attractors only work on the farm."); return false; }
    const item = spell.cast.yield || "Honey";
    this.attractors.set(`${x},${y}`, { item, until: this.day + 3 });
    this.addItem(item, 1);
    this.spawnBurst(x, y, "#e8c24a", 6);
    this.spawnFloat(x, y, `+1 ${item}`, "#f0d98a");
    this.pushLog(`${spell.name} set a lure — it yields ${item} for the next few days.`);
    return true;
  }
  _castProspect({ x, y, radius }) {
    if (this.zone !== "cave") { this.pushLog("Prospecting only reveals ore underground."); return false; }
    const r = radius || 3; let found = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx, ty = y + dy;
      if (MINE_ROCK[this.zones.cave.tiles[ty]?.[tx]]) { this.revealed.add(`cave,${tx},${ty}`); found++; }
    }
    this.spawnBurst(x, y, "#c9b06a", 6);
    this.pushLog(found ? `Prospecting revealed ${found} ore vein${found === 1 ? "" : "s"} nearby.` : "Prospecting found no veins in range.");
    return true;
  }
  _castRefine() {
    for (const recipe of REFINE_RECIPES) {
      if ((this.inventory[recipe.input] || 0) > 0) {
        this.inventory[recipe.input]--; if (this.inventory[recipe.input] <= 0) delete this.inventory[recipe.input];
        this.addItem(recipe.output, 1);
        this.spawnFloat(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE), `+1 ${recipe.output}`, "#cfc088");
        this.pushLog(`Refined ${recipe.input} → ${recipe.output}.`);
        return true;
      }
    }
    this.pushLog("Nothing to refine — forage or mine a raw material first.");
    return false;
  }
  _castMineBurst({ x, y, radius, power, spell }) {
    if (this.zone !== "cave") { this.pushLog("Mining bursts only work in the mine."); return false; }
    const r = radius || 1; let hit = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx, ty = y + dy;
      const rock = MINE_ROCK[this.zones.cave.tiles[ty]?.[tx]];
      if (!rock) continue;
      const key = `${tx},${ty}`;
      const hp = (this.rockHp.get(key) ?? rock.hp) - Math.max(1, power || 1);
      if (hp <= 0) {
        this.zones.cave.tiles[ty][tx] = "."; this.rockHp.delete(key); this.revealed.delete(`cave,${tx},${ty}`);
        const mat = rock.materials[Math.floor(Math.random() * rock.materials.length)];
        this.addItem(mat, 1); this.spawnFloat(tx, ty, `+1 ${mat}`, "#dcc9a0");
      } else this.rockHp.set(key, hp);
      this.spawnBurst(tx, ty, "#9a8c74", 4); hit++;
    }
    if (!hit) { this.pushLog("No rock in range to shatter."); return false; }
    this.pushLog(`${spell.name} shattered rock across ${hit} tile${hit === 1 ? "" : "s"}.`);
    return true;
  }
  _castMutate({ x, y, power }) {
    const plot = this.zones.farm.plots.get(`${x},${y}`);
    if (this.zone !== "farm" || !plot?.ready || !plot.crop) { this.pushLog("Aim a mutation at a mature crop ready to harvest."); return false; }
    plot.mutated = (plot.mutated || 0) + Math.max(1, power || 1);
    this.spawnBurst(x, y, "#f0c94a", 10);
    this.spawnSpark(x, y, "#fff0b0", 7);
    this.spawnFloat(x, y, "mutating!", "#ffe9a0");
    this.pushLog("Forced a rare mutation — this harvest will yield extra premium fruit.");
    return true;
  }

  getSelectedSpell() { const id = this.wand[this.wandIndex]; return id == null ? null : spells[id]; }
  // The wand is a fixed row of equipped-spell slots (spell object or null per
  // slot). Spells are equipment, not items — arranged in the Inventory Wand tab.
  getWand() { return this.wand.map(id => (id == null ? null : spells[id])); }

  // ---------- wand equipping (driven by the Inventory Wand tab) ----------
  // Equip a known spell into a specific wand slot. Any other slot already
  // holding that spell is cleared first so a spell never appears twice.
  equipWand(slot, spellId) {
    if (slot == null || slot < 0 || slot >= WAND_SLOTS) return;
    if (spellId == null || !this.knownSpells.has(spellId)) return;
    for (let i = 0; i < WAND_SLOTS; i++) if (this.wand[i] === spellId) this.wand[i] = null;
    this.wand[slot] = spellId;
  }
  // Swap two wand slots (drag one equipped spell onto another).
  moveWandSlot(from, to) {
    if (from == null || to == null || from === to) return;
    if (from < 0 || to < 0 || from >= WAND_SLOTS || to >= WAND_SLOTS) return;
    const tmp = this.wand[from]; this.wand[from] = this.wand[to]; this.wand[to] = tmp;
  }
  unequipWand(slot) {
    if (slot == null || slot < 0 || slot >= WAND_SLOTS) return;
    this.wand[slot] = null;
  }
  // Auto-equip a newly learned spell into the first empty wand slot (if any and
  // it isn't already equipped) so discoveries are immediately usable.
  autoEquipWand(spellId) {
    if (this.wand.includes(spellId)) return;
    const free = this.wand.indexOf(null);
    if (free !== -1) this.wand[free] = spellId;
  }

  // ---------- item hotbar (materials mirrored from the bag) ----------
  // Projects the item hotbar onto {name,count} slots — count read live from the
  // bag so a hotbar material greys out / empties as the stack is used up.
  getItemHotbar() {
    return this.itemHotbar.map(name => (name == null ? null : { name, count: this.inventory[name] || 0 }));
  }
  // Put a material into a specific item-hotbar slot (drag from the storage grid).
  // Any other slot already holding it is cleared first so it never appears twice.
  assignItemHotbar(slot, name) {
    if (slot == null || slot < 0 || slot >= ITEM_HOTBAR) return;
    if (name == null) return;
    for (let i = 0; i < ITEM_HOTBAR; i++) if (this.itemHotbar[i] === name) this.itemHotbar[i] = null;
    this.itemHotbar[slot] = name;
  }
  moveItemHotbarSlot(from, to) {
    if (from == null || to == null || from === to) return;
    if (from < 0 || to < 0 || from >= ITEM_HOTBAR || to >= ITEM_HOTBAR) return;
    const tmp = this.itemHotbar[from]; this.itemHotbar[from] = this.itemHotbar[to]; this.itemHotbar[to] = tmp;
  }
  clearItemHotbarSlot(slot) {
    if (slot == null || slot < 0 || slot >= ITEM_HOTBAR) return;
    this.itemHotbar[slot] = null;
  }
  // Drop a newly acquired seed material into the first empty item-hotbar slot.
  autoPlaceItemHotbar(name) {
    if (this.itemHotbar.includes(name)) return;
    const free = this.itemHotbar.indexOf(null);
    if (free !== -1) this.itemHotbar[free] = name;
  }
  getPlantableMaterials() { return Object.entries(materialsByRung).filter(([r]) => Number(r) <= this.maxRungUnlocked).flatMap(([, names]) => names); }

  // Per-material stack cap creates a real management decision (sell/plant it
  // down before foraging/mining more of the same thing) instead of unlimited
  // hoarding. Overflow is simply dropped, with a log so it's never silent.
  addItem(name, n) {
    const have = this.inventory[name] || 0;
    const capped = Math.min(MAX_STACK, have + n);
    if (capped === have) { this.pushLog(`Satchel's full of ${name} — sell or plant some first.`); return; }
    this.inventory[name] = capped;
    // Auto-place newly acquired seed materials into the item hotbar so they're
    // click-to-plant ready (skip energy/essence — those aren't plantable seeds).
    if (have === 0 && MATERIAL_ROLE[name]) this.autoPlaceItemHotbar(name);
  }
  discardItem(name, n = 1) {
    if (!(this.inventory[name] > 0)) return;
    this.inventory[name] -= n;
    if (this.inventory[name] <= 0) delete this.inventory[name];
    this.pushLog(`Discarded ${name}.`);
  }
  spendItem(name, n = 1) {
    if (!(this.inventory[name] > 0)) return;
    this.inventory[name] -= n;
    if (this.inventory[name] <= 0) delete this.inventory[name];
  }

  // ---------- Aether Wand: siphon ambient energy (G) ----------
  // A keyboard shortcut for the same draw a Vine-spell click performs, but at the
  // player's own tile — reads the energy of the moment (energyFromConditions) and
  // pulls it into your reserves. Handy for topping up without switching spells.
  siphonEnergy() {
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    this.extractEnergyAt(ptx, pty);
  }

  // ---------- Crafting: distil role Essence (Inventory > Crafting tab) ----------
  craftEssence(role) {
    const recipe = ESSENCE_RECIPES.find(r => r.role === role);
    if (!recipe) return;
    const mat = recipe.materials.find(m => (this.inventory[m] || 0) >= recipe.matCost);
    if (!mat) { this.pushLog(`Need ${recipe.matCost} of a ${role} material to distil ${recipe.result}.`); return; }
    const energy = ENERGY_TYPES.find(e => (this.inventory[e] || 0) >= recipe.energyCost);
    if (!energy) { this.pushLog(`Need ${recipe.energyCost} energy to bind ${recipe.result} — draw some from the wild with a Vine spell (or press G).`); return; }
    if ((this.inventory[recipe.result] || 0) >= MAX_STACK) { this.pushLog(`Your ${recipe.result} stack is full.`); return; }
    this.spendItem(mat, recipe.matCost);
    this.spendItem(energy, recipe.energyCost);
    this.addItem(recipe.result, recipe.yield);
    this.pushLog(`Distilled ${recipe.yield} ${recipe.result} from ${recipe.matCost} ${mat} + ${recipe.energyCost} ${energy}.`);
  }

  // ---------- Minecraft-style slot inventory (UI projection of this.inventory) ----------
  // Game logic keeps using inventory as a material->count bag; these helpers lay
  // it out on a fixed grid so the Inventory screen can pick up a stack, drop it
  // into another slot, or trash it. Artifacts are excluded (own panel section).
  getInvSlots() {
    const owned = n => this.inventory[n] > 0 && !ARTIFACTS[n];
    const slots = new Array(INV_SLOTS).fill(null);
    const placed = new Set();
    // 1) honour the player's explicit slot arrangement
    for (let i = 0; i < INV_SLOTS; i++) {
      const n = this.invOrder[i];
      if (n && owned(n) && !placed.has(n)) { slots[i] = { name: n, count: this.inventory[n] }; placed.add(n); }
    }
    // 2) drop any newly-acquired material into the first free slot
    for (const n of Object.keys(this.inventory)) {
      if (!owned(n) || placed.has(n)) continue;
      const free = slots.indexOf(null);
      if (free === -1) break;
      slots[free] = { name: n, count: this.inventory[n] };
      placed.add(n);
    }
    return slots;
  }
  // Pick-up-and-drop: move the stack in slot `from` into slot `to`, swapping if
  // `to` is occupied. Freezes the current layout into invOrder so nothing else
  // shifts, then applies the (possibly swapping) move.
  moveInvSlot(from, to) {
    if (from == null || to == null || from === to) return;
    const order = this.getInvSlots().map(s => (s ? s.name : null));
    if (!order[from]) return;
    const moved = order[from];
    order[from] = order[to];
    order[to] = moved;
    this.invOrder = order;
  }
  // Trashcan: permanently delete the whole stack sitting in slot `index`.
  trashInvSlot(index) {
    const name = this.getInvSlots()[index]?.name;
    if (!name) return;
    delete this.inventory[name];
    this.invOrder = this.getInvSlots().map(s => (s ? s.name : null));
    this.pushLog(`Trashed ${name}.`);
  }
  pushLog(text) { this.log.push(text); if (this.log.length > 6) this.log.shift(); }

  // ---------- cosmetic effects (floating text + particles) ----------
  // Spawn a "+N" style pickup label centred on tile (tx,ty). It stays anchored
  // at the tile and simply fades — no upward drift, so a foraged item reads as
  // "collected here" rather than an object floating up off the ground.
  spawnFloat(tx, ty, text, color = "#f7efd8") {
    this.effects.push({ kind: "text", x: (tx + 0.5) * TILE, y: ty * TILE + TILE * 0.3, vx: 0, vy: 0, life: 0, maxLife: 1.15, text, color });
    if (this.effects.length > 80) this.effects.shift(); // hard cap, never unbounded
  }
  // Spawn a small burst of particles at tile (tx,ty).
  spawnBurst(tx, ty, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 34;
      this.effects.push({ kind: "dot", x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 24, life: 0, maxLife: 0.55 + Math.random() * 0.2, color });
    }
    if (this.effects.length > 80) this.effects.splice(0, this.effects.length - 80);
  }
  // Bright, fast, short-lived sparks at tile (tx,ty) — layered on top of a burst
  // at impactful moments (mine hits, harvest pops, casts) for extra crunch. Also
  // kicks a little screen-shake proportional to the spark count.
  spawnSpark(tx, ty, color = "#fff2c0", n = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 90;
      this.effects.push({ kind: "spark", x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0, maxLife: 0.3 + Math.random() * 0.18, color });
    }
    this.shake = Math.min(6, this.shake + n * 0.5);
    if (this.effects.length > 80) this.effects.splice(0, this.effects.length - 80);
  }
  // Soft grey footstep dust — takes WORLD-PIXEL coords (unlike the tile-based
  // spawners) since it's driven from the player's live pixel position.
  spawnDust(px, py) {
    const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 8;
    this.effects.push({ kind: "dust", x: px + (Math.random() * 6 - 3), y: py, vx: Math.cos(a) * sp, vy: -6 - Math.random() * 6, life: 0, maxLife: 0.5 + Math.random() * 0.25, color: "rgba(180,165,135,0.55)" });
    if (this.effects.length > 80) this.effects.shift();
  }
  updateEffects(dt) {
    if (!this.effects.length) return;
    for (const e of this.effects) {
      e.life += dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.kind === "dot" || e.kind === "spark") e.vy += 130 * dt; // gravity on particles
      else if (e.kind === "dust") { e.vx *= 0.9; e.vy *= 0.92; }    // dust drifts and settles
      else e.vy *= 0.9;                                             // floaters ease upward then slow
    }
    this.effects = this.effects.filter(e => e.life < e.maxLife);
  }

  // Spend from the daily stamina pool for a labor action; blocks (with a log)
  // when there isn't enough, nudging the player to rest. Returns whether the
  // action may proceed, so callers guard with `if (!this.spendStamina(n)) return;`.
  spendStamina(cost) {
    if (this.stamina < cost) { this.pushLog("Too worn out to keep working — rest (press N) to recover your stamina."); return false; }
    this.stamina = Math.max(0, this.stamina - cost);
    return true;
  }

  // ---------- artifact (single equippable slot, rung 4-5 "proper items") ----------
  // A real equippable good, distinct from stackable materials — consumes the
  // source material to equip, returns it to inventory on unequip (same
  // slot-swap idiom selectedMaterial already uses).
  equipArtifact(name) {
    if (!ARTIFACTS[name]) { this.pushLog(`${name} isn't an artifact.`); return; }
    if (!(this.inventory[name] > 0)) { this.pushLog(`You don't have a ${name}.`); return; }
    if (this.artifact) this.addItem(this.artifact, 1); // return the previous one
    this.inventory[name]--;
    if (this.inventory[name] <= 0) delete this.inventory[name];
    this.artifact = name;
    this.pushLog(`Equipped ${ARTIFACTS[name].name} — ${ARTIFACTS[name].effect}.`);
  }
  unequipArtifact() {
    if (!this.artifact) return;
    this.addItem(this.artifact, 1);
    this.pushLog(`Unequipped ${ARTIFACTS[this.artifact].name}.`);
    this.artifact = null;
  }

  advanceDay() {
    this.day++;
    this.season = SEASONS[Math.floor((this.day - 1) / 7) % 4];
    this.stamina = this.maxStamina; // a full night's rest
    this.weather = this.rollWeather();
    this.rollDemand(); // market prices drift overnight (used by the hauler below too)
    for (const plot of this.zones.farm.plots.values()) {
      if (plot.crop && !plot.ready && this.day >= plot.matureDay) plot.ready = true;
    }
    // Sell everything deposited in the shipping bin overnight (Stardew-style).
    const shipped = this.sellShippingBin();
    // Foraged-out nodes regrow randomly rather than on a fixed timer: for every
    // day that's passed since it was picked, a depleted node rolls an independent
    // chance to return, so forage repopulates the world unpredictably over time.
    for (const [key, forageDay] of [...this.nodeRespawn]) {
      if (this.day > forageDay && Math.random() < NODE_RESPAWN_CHANCE) this.nodeRespawn.delete(key);
    }
    // Water pulses last only the day they're cast.
    this.wateredToday.clear();
    // Ranch lures (attract casts) drip their yield each morning until they lapse.
    let lured = 0;
    for (const [key, node] of [...this.attractors]) {
      if (this.day > node.until) { this.attractors.delete(key); continue; }
      this.addItem(node.item, 1); lured++;
    }
    let msg = `Day ${this.day} — ${this.season}.`;
    if (shipped.count) msg += ` Shipping bin sold ${shipped.count} item${shipped.count === 1 ? "" : "s"} for ${shipped.earned}g.`;
    if (lured) msg += ` Lures yielded ${lured} good${lured === 1 ? "" : "s"}.`;
    if (this.weather === "Drought") msg += " A drought bakes the land — streams run dry.";
    else if (this.weather === "Rain") msg += " Steady rain soaks the fields (Water is plentiful).";
    if (this.haulerActive) {
      const { sold, earned } = this.autoSell();
      if (sold) { this.gold += earned; msg += ` Hauler sold ${sold} fruit for ${earned}g.`; }
    }
    this.pushLog(msg);
  }

  // Weather leans on the season: hot Summers risk drought, wet Springs bring
  // rain. Everything else is Clear. Only Water is affected, which the spell
  // grammar already reads via getPlotConditions — no parallel system.
  rollWeather() {
    const r = Math.random();
    if (this.season === "Summer" && r < 0.4) return "Drought";
    if (this.season === "Spring" && r < 0.4) return "Rain";
    return "Clear";
  }

  autoSell() {
    let remaining = 3, sold = 0, earned = 0;
    for (const s of spells.filter(sp => sp.role === "Pod")) {
      if (remaining <= 0) break;
      const have = this.inventory[s.name] || 0;
      if (have > 0) {
        const take = Math.min(have, remaining);
        this.inventory[s.name] -= take;
        if (this.inventory[s.name] <= 0) delete this.inventory[s.name];
        earned += take * this.fruitPrice(s); sold += take; remaining -= take;
      }
    }
    return { sold, earned };
  }

  // ---------- HUD ----------
  computePrompt() {
    const { x, y } = this.facingTile();
    const tiles = this.zones[this.zone]?.tiles;
    const tile = tiles?.[y]?.[x];
    if (tile === undefined) return "";

    const exit = (ZONE_EXITS[this.zone] || []).find(e => e.mouth.x === x && e.mouth.y === y);
    if (exit) {
      if (exit.minRung && this.maxRungUnlocked < exit.minRung) return exit.lockedMessage;
      return exit.to === "farm" ? "Take the road back to the farm" : `Take the road to ${ZONE_NAMES[exit.to]}`;
    }

    const sel = this.getSelectedSpell();

    // Blighted farmland reads before everything else, matching performClickAction.
    if (this.zone === "farm" && this.blight.has(`${x},${y}`)) {
      const role = this.blight.get(`${x},${y}`).cure.role;
      return sel?.role === role ? `Click to cleanse the Withering (${role})` : `Blighted ground — equip a ${role} spell to cleanse it`;
    }

    if ((this.zone === "farm" || this.zone === "forest") && RESOURCE_NODES[tile]) {
      return this.nodeRespawn.has(`${this.zone},${x},${y}`) ? "Depleted — will regrow." : `Click to forage ${RESOURCE_NODES[tile].material}`;
    }

    if (this.zone === "farm") {
      if (tile === "B") return this.selectedMaterial && this.sellValue(this.selectedMaterial) > 0 ? `Click to ship ${this.selectedMaterial} for sale` : "Shipping bin — select a crop/fruit/ore to sell, then click";
      if (tile === ".") return "Click to till this soil";
      if (tile === "D") {
        const plot = this.zones.farm.plots.get(`${x},${y}`);
        if (plot?.ready && plot.crop) return `Click to harvest ${plot.crop}`;
        if (!plot?.crop) return this.selectedMaterial && SEED_TO_CROP[this.selectedMaterial] ? `Click to plant ${SEED_TO_CROP[this.selectedMaterial]}` : "Select a crop seed in your bar first, then click to plant";
        return `Growing ${plot.crop}… ripe on day ${plot.matureDay}`;
      }
      if (tile === "s") return "Click to refine (needs raw material + Fungus spell)";
      if (tile === "k") { const b = this.bestDemandFruit(); return b ? `Click to sell — ${b.name} in ${b.tag} demand (×${b.mult})` : "Click to sell fruit/refined goods at market"; }
      return "";
    }
    if (this.zone === "cave" && MINE_ROCK[tile]) {
      return sel?.role === "Root" ? "Click to mine" : "Hold a Root spell (1–6) to mine";
    }
    if (this.zone === "town" && tile === "m") return this.shopOpen ? "Click to close the shop" : "Click to open the shop";
    if (this.zone === "town" && tile === "q") return this.questBoardOpen ? "Click to leave the notice board" : "Click to read the town notice board";
    return "";
  }

  // Step-by-step guidance for the crop-growing loop — a persistent checklist
  // (till → plant → grow → harvest) with a live "what to do now" line for the
  // stage of the plot the player faces. Returned only when facing a farmable
  // tile so it surfaces when useful. Pure/read-only (snapshot-safe).
  computeRitualGuide() {
    if (this.zone !== "farm") return null;
    const { x, y } = this.facingTile();
    const tile = this.zones.farm.tiles?.[y]?.[x];
    if (tile !== "." && tile !== "D") return null;
    // Don't hijack the guide over blighted ground — that has its own cure flow.
    if (this.blight.has(`${x},${y}`)) return null;

    const plot = this.zones.farm.plots.get(`${x},${y}`);

    let current, detail;
    if (tile === ".") {
      current = 0;
      detail = "Click this soil to till it (or press T).";
    } else if (!plot?.crop) {
      current = 1;
      detail = this.selectedMaterial && SEED_TO_CROP[this.selectedMaterial]
        ? `Click the plot to plant ${SEED_TO_CROP[this.selectedMaterial]}.`
        : "Select a crop seed in your bar, then click the plot.";
    } else if (!plot.ready) {
      current = 2;
      detail = `Growing ${plot.crop} — ripe on day ${plot.matureDay}. Hold a Grow spell and press F to hurry it.`;
    } else {
      current = 3;
      detail = `Ripe! Click to harvest ${plot.crop}.`;
    }

    const steps = RITUAL_STEPS.map((label, i) => ({ label, done: i < current, active: i === current }));
    return { current, detail, steps };
  }

  // A parallel "press F to cast" hint, shown alongside (not replacing) the click
  // prompt so both input paths stay legible. Empty unless a cast-capable spell
  // is equipped and aimed at a tile its ability can affect.
  computeCastPrompt() {
    const sel = this.getSelectedSpell();
    if (!sel?.cast) return "";
    const { x, y } = this.facingTile();
    return this.castHintFor(sel, x, y) || "";
  }
  castHintFor(spell, x, y) {
    if (!spell?.cast || !this.castTargetValid(spell, x, y)) return null;
    const cd = Math.max(0, (this.spellCooldownUntil[spell.id] || 0) - this.day);
    if (cd > 0) return `${spell.name} recharging (${cd}d)`;
    const c = spell.cast.cost || {};
    const mods = this.masteryMods(spell.id);
    const stam = Math.max(0, Math.round((c.stamina || 0) * mods.costMult));
    return `Press F: cast ${spell.name}${stam ? ` — ${stam} stamina` : ""}`;
  }
  castTargetValid(spell, x, y) {
    const tile = this.zones[this.zone]?.tiles[y]?.[x];
    const plot = this.zone === "farm" ? this.zones.farm.plots.get(`${x},${y}`) : null;
    switch (spell.cast.kind) {
      case "grow_pulse": return this.zone === "farm" && !!plot?.crop && !plot.ready;
      case "mutate": return this.zone === "farm" && !!plot?.ready && !!plot.crop;
      case "water_pulse": return this.zone === "farm" && tile === "D";
      case "cleanse": return this.zone === "farm" && this.blight.has(`${x},${y}`);
      case "attract": return this.zone === "farm";
      case "prospect": return this.zone === "cave";
      case "mine_burst": return this.zone === "cave" && !!MINE_ROCK[tile];
      case "haul_deliver": return true;
      case "refine_cast": return true;
      default: return false;
    }
  }

  // The spellbook starts entirely "???" — each entry only reveals its
  // rung until harvestSpell() adds it to knownSpells, mirroring the same
  // discover-through-play mechanic that already drives maxRungUnlocked.
  getSpellbook() {
    return spells.map(s => {
      if (this.knownSpells.has(s.id)) {
        return {
          id: s.id, rung: s.rung, known: true, name: s.name, role: s.role,
          material: s.material, catalyst: s.catalyst, effect: s.effect,
          interaction: s.interaction, tag: s.tag,
          cast: s.cast ? { kind: s.cast.kind, cost: s.cast.cost || {} } : null,
          masteryLevel: this.masteryLevel(s.id),
          masteryUses: (this.mastery[s.id]?.casts || 0) + (this.mastery[s.id]?.harvests || 0),
          cooldownDaysLeft: Math.max(0, (this.spellCooldownUntil[s.id] || 0) - this.day),
        };
      }
      // Undiscovered: reveal only what the player's clue level has earned, using
      // existing authored fields (never touches resolveRecipe's grammar).
      const clue = this.clues[s.id] || 0;
      return {
        id: s.id, rung: s.rung, known: false,
        name: "???",
        role: clue >= 1 ? s.role : "???",
        material: clue >= 2 ? `rung-${s.rung} ${s.role} material` : "???",
        catalyst: clue >= 3 ? catalystFamily(s.catalyst) : "???",
        effect: "???",
        clueLevel: clue,
        requirement: clue >= 2 ? spellRequirements(s) : null,
      };
    });
  }

  getSnapshot() {
    return {
      zone: this.zone, zoneName: ZONE_NAMES[this.zone], day: this.day, season: this.season, gold: this.gold,
      stamina: this.stamina, maxStamina: this.maxStamina, weather: this.weather,
      reputation: this.reputation, questBoardOpen: this.questBoardOpen, quests: this.getQuests(),
      mapOpen: this.mapOpen, playerTile: { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) },
      blightRemaining: this.blight.size,
      shopPremiumLocked: this.reputation < REP_PREMIUM_GATE, premiumRepNeeded: REP_PREMIUM_GATE,
      inventory: { ...this.inventory },
      invSlots: this.getInvSlots(), invCols: INV_COLS,
      artifact: this.artifact,
      wand: this.getWand(),
      wandSlots: WAND_SLOTS,
      wandIndex: this.wandIndex,
      itemHotbar: this.getItemHotbar(),
      selectedMaterial: this.selectedMaterial,
      selectedEnergy: this.selectedEnergy,
      heldSpell: (() => { const s = this.getSelectedSpell(); return s ? { id: s.id, name: s.name, role: s.role } : null; })(),
      shippingBin: { ...this.shippingBin },
      maxRungUnlocked: this.maxRungUnlocked,
      haulerActive: this.haulerActive,
      shopOpen: this.shopOpen,
      potOpen: this.potOpen,
      shopListings: this.getShopListings(),
      rungUnlockPrice: this.getRungUnlockPrice(),
      upgrades: this.getUpgrades(),
      completed: this.completed,
      spellsKnown: this.knownSpells.size,
      spellsTotal: spells.length,
      // Deep-cloned so the 120ms bridge never leaks a live object (mastery
      // values mutate between polls); cooldowns pre-derived to days remaining.
      mastery: Object.fromEntries(Object.entries(this.mastery).map(([id, m]) => [id, { ...m }])),
      spellCooldowns: Object.fromEntries(Object.entries(this.spellCooldownUntil).map(([id, until]) => [id, Math.max(0, until - this.day)])),
      prompt: this.computePrompt(),
      castPrompt: this.computeCastPrompt(),
      ritualGuide: this.computeRitualGuide(),
      log: [...this.log],
      facing: this.player.facing,
      spellbook: this.getSpellbook(),
    };
  }
}
