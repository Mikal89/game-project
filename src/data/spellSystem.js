// Shared spell-system data & rules, used by both the Spellbook Explorer
// (App.jsx) and the playable beta (src/game). Single source of truth so the
// design ideas stay identical between the two.
//
// DISCOVERY INVARIANT (do not break): a spell is discovered by planting its
// `material`, spraying to draw out that material's essence *role*, then
// releasing a `catalyst`. The role is looked up from `essenceSources`
// (reversed into MATERIAL_ROLE in GameEngine.js), so **every spell's material
// must be listed as an essence source of that spell's own role, and each
// material may belong to exactly one role** (duplicates collapse). The tables
// below are partitioned to satisfy this for all 42 spells; keep them so.

export const roles = ["All", "Bloom", "Root", "Vine", "Fungus", "Pod"];
export const rungs = [
  { id: 1, name: "Forage", note: "Starter grammar", gate: "Available from the start" },
  { id: 2, name: "Cultivate", note: "Production setup", gate: "Build a plot, shaft, or attractor bloom" },
  { id: 3, name: "Refine", note: "Interlocking systems", gate: "Run Refine Cap + build a workbench" },
  { id: 4, name: "Craft", note: "Magical power tools", gate: "Crafting bench + refined stockpile" },
  { id: 5, name: "Discover", note: "Rare keystones", gate: "Explore deep mines and restore regions" },
];

// [rung, name, role, material, catalyst, effect, interaction, tag]
// IDs are the positional index below and are referenced externally
// (STARTER_SPELL_IDS, knownSpells) — NEVER reorder rows; only append.
const rawSpells = [
  [1,"Sprout Kiss","Bloom","Petals","Sunlight","Advances one crop a growth stage","Tap","Starter",{kind:"grow_pulse",cost:{material:"self",stamina:8},power:1}],
  [1,"Rain Petal","Bloom","Petals","Water","Waters a whole crop patch","Tap","Starter",{kind:"water_pulse",cost:{material:"self",stamina:6,cooldown:1},power:3}],
  [1,"Nightbud","Bloom","Petals","Moonlight","Crops raised near it sell at a premium","Tap","Value"],
  [1,"Root Tap","Root","Claybound Rootlets","Darkness","Shatters rock and pulls out its ore","Tap","Mining",{kind:"mine_burst",cost:{stamina:8},radius:0,power:1}],
  [1,"Mudroot","Root","Claybound Rootlets","Water","Digs wet ground and drains a waterlogged tile","Feed–Tend","Mining"],
  [1,"Creek Vine","Vine","Reed","Water","Floats goods along a water tile","Drag","Logistics"],
  [1,"Reed Haul","Vine","Reed","Sunlight","Carries items a short distance by day","Drag","Logistics"],
  [1,"Rotcap","Fungus","Wild Spores","Water","Turns dead crops and waste into fresh Compost","Feed–Tend","Gateway",{kind:"cleanse",cost:{material:"self",stamina:6,cooldown:1}}],
  [1,"Sweetberry","Pod","Wild Seed","Sunlight","First sellable foraged fruit, low value","Tap","Grower"],
  [1,"Duskberry","Pod","Wild Seed","Moonlight","Night berries with a small premium","Tap","Grower"],
  [2,"Sunblossom","Bloom","Pollen","Sunlight","Aura: nearby crops grow faster","Tap / Place","Grower"],
  [2,"Dewbind","Bloom","Pollen","Water","Auto-waters its patch daily, unattended","Tap / Place","Grower"],
  [2,"Beebalm","Bloom","Grain","Sunlight","Attracts bees, yielding Honey and Beeswax","Tap / Place","Ranching",{kind:"attract",cost:{material:"self",stamina:8,cooldown:3},yield:"Honey"}],
  [2,"Grazeflower","Bloom","Grain","Water","Attracts grazers, yielding Manure and Wool","Tap / Place","Ranching"],
  [2,"Ore Whisper","Root","Copper Ore","Moonlight","Reveals nearby ore veins","Tap","Mining",{kind:"prospect",cost:{material:"role",stamina:6,cooldown:2},radius:3}],
  [2,"Deep Root","Root","Stone","Darkness","Digs hard stone","Feed–Tend","Mining"],
  [2,"Vine Haul","Vine","Fiber","Sunlight","Auto-carries mined ore to storage","Drag","Logistics"],
  [2,"Deepvine","Vine","Fiber","Darkness","Hauls ore up out of the cave","Drag","Logistics"],
  [2,"Refine Cap","Fungus","Compost","Darkness","Composts waste into a sellable brick of nutrients","Feed–Tend","Gateway",{kind:"refine_cast",cost:{stamina:6,cooldown:1}}],
  [2,"Croppod","Pod","Farm Seed","Sunlight","Reliable staple crop, better than foraged fruit","Tap","Grower"],
  [2,"Duskpod","Pod","Farm Seed","Moonlight","Premium farmed night fruit","Tap","Grower"],
  [3,"Hardy Bloom","Bloom","Wax","Sunlight","Crops ignore off-season and weather penalties","Tap / Place","Grower"],
  [3,"Deepbore","Root","Iron Ingot","Darkness","Digs the deepest hard stone","Feed–Tend","Mining",{kind:"mine_burst",cost:{material:"role",stamina:12,cooldown:1},radius:1,power:2}],
  [3,"Prospect Root","Root","Iron Ingot","Moonlight","Reveals a wide radius, including deeper veins","Tap","Mining"],
  [3,"Loomcap","Fungus","Mycofiber","Darkness","Weaves fungal thread into Cloth and Rope","Feed–Tend","Refining"],
  [3,"Iron Cap","Fungus","Iron Ore","Darkness","Refines hard ore into high-grade ingots","Feed–Tend","Refining"],
  [3,"Market Vine","Vine","Rope","Sunlight","Delivers goods to the stall and sells them","Drag","Logistics"],
  [3,"Coldvine","Vine","Cloth","Darkness","Moves perishable goods without spoiling","Drag","Logistics"],
  [3,"Honeypod","Pod","Honey","Sunlight","Sweet premium fruit","Tap","Grower"],
  [3,"Everpod","Pod","Sap","Sunlight","Hardy perennial; produces across seasons","Tap, recurring","Grower"],
  [4,"Gold Bloom","Bloom","Goldpetal","Sunlight","Charge with sunlight to force a rare mutation","Hold–Charge","Power",{kind:"mutate",cost:{material:"self",stamina:16,cooldown:2},power:1}],
  [4,"Quakeroot","Root","Alloy","Darkness","Charge and release for a large-radius instant dig","Hold–Charge","Power",{kind:"mine_burst",cost:{material:"role",stamina:16,cooldown:2},radius:2,power:3}],
  [4,"Trade Vine","Vine","Filament","Sunlight","Map-wide auto-delivery between any two points","Drag","Logistics"],
  [4,"Ember Cap","Fungus","Emberspore","Moonlight","Turns premium metal into fine tools and artifacts","Timed","Refining"],
  [4,"Confectipod","Pod","Confection","Sunlight","Luxury confection fruit, high value","Tap","Grower"],
  [5,"Moonpetal","Bloom","Everbloom Pollen","Moonlight","Guarantees top-quality crops; peaks on a full moon","Timed","Keystone"],
  [5,"Crystal Sense","Root","Crystal Shard","Darkness","Reveals rare gem deposits deep underground","Tap","Keystone"],
  [5,"Skyvine","Vine","Skyvine Silk","Moonlight","Teleport-delivers one high-value item per full moon","Drag","Keystone"],
  [5,"Moon Refine","Fungus","Moonspore","Moonlight","Turns gems into jewelry, the highest-value refined good","Timed","Keystone"],
  [5,"Prizepod","Pod","Everbloom Seed","Sunlight","Rarest fruit; peak harvest pays, late harvest spoils","Timed","Keystone"],
  // Appended for Fungus parity (6 -> 8) — new IDs 40, 41. Reuse existing
  // foraged materials with fresh catalysts so no new obtainability is needed.
  [1,"Moldmend","Fungus","Wild Spores","Darkness","Knits rot back into living mycelium, mending blighted ground","Feed–Tend","Gateway"],
  [2,"Marshcap","Fungus","Compost","Water","Spreads a wet mat that composts an entire patch overnight","Feed–Tend","Refining"],
];
export const spells = rawSpells.map((s, id) => ({ id, rung:s[0], name:s[1], role:s[2], material:s[3], catalyst:s[4], effect:s[5], interaction:s[6], tag:s[7], cast:s[8] ?? null }));

// Spells are brewed in the Pot by combining a material item + a catalyst item,
// resolved through resolveRecipe. The Pot outputs a Spell *item* the player
// holds and casts on the world (grow a crop, shatter a rock). These two rung-1
// spells are pre-known so both tutorial actions work from a fresh save:
// Sprout Kiss (grow a planted crop) and Root Tap (mine rock for ore). Cleanse
// blight and the rest are discovered later by experimenting in the Pot.
export const STARTER_SPELL_IDS = [0, 3]; // Sprout Kiss (grow), Root Tap (mine)

// Every material appears in exactly one role's essenceSources below and at the
// same rung here — this is the plantable-seed catalog gated by unlocked rung.
export const materialsByRung = {
  1:["Petals","Claybound Rootlets","Reed","Wild Spores","Wild Seed"],
  2:["Pollen","Grain","Copper Ore","Stone","Fiber","Compost","Farm Seed"],
  3:["Wax","Iron Ingot","Rope","Cloth","Mycofiber","Iron Ore","Honey","Sap"],
  4:["Goldpetal","Alloy","Filament","Emberspore","Confection"],
  5:["Everbloom Pollen","Crystal Shard","Skyvine Silk","Moonspore","Everbloom Seed"],
};
// Catalyst amount a plot must supply to resolve a spell of that rung. Kept
// within reach of the seasonal conditions below (max Sunlight 6 / Darkness 5 /
// Moonlight 5 / Water via streams) so every rung is discoverable in-season.
export const catalystCosts = { 1:1, 2:2, 3:3, 4:4, 5:5 };
export const seasonalConditions = {
  Spring:{ Sunlight:3, Water:4, Snowfall:0, Darkness:2, Moonlight:2 },
  Summer:{ Sunlight:6, Water:1, Snowfall:0, Darkness:1, Moonlight:2 },
  Autumn:{ Sunlight:3, Water:2, Snowfall:0, Darkness:3, Moonlight:3 },
  Winter:{ Sunlight:1, Water:1, Snowfall:6, Darkness:5, Moonlight:5 },
};
export const conditionNames = ["Sunlight","Water","Snowfall","Darkness","Moonlight"];

// A spell resolves when the plot supplies at least `catalystCosts[rung]` of the
// spell's catalyst. Discovery is about matching role + material + catalyst and
// timing the right season/place to draw enough energy — not juggling a matrix
// of secondary conditions (which used to make many spells unreachable).
export function spellRequirements(spell) {
  const needs = { Sunlight:0, Water:0, Snowfall:0, Darkness:0, Moonlight:0 };
  needs[spell.catalyst] = catalystCosts[spell.rung];
  return needs;
}

export const roleMarks = { Bloom:"BL", Root:"RT", Vine:"VN", Fungus:"FG", Pod:"PD" };

// Material -> role map (reversed into MATERIAL_ROLE by the engine). Six
// materials per role, one per used slot; no material repeats across roles.
export const essenceSources = {
  Bloom: { name:"Bloom Essence", sources:[
    {material:"Petals",rung:1,yield:1},{material:"Pollen",rung:2,yield:2},{material:"Grain",rung:2,yield:2},
    {material:"Wax",rung:3,yield:3},{material:"Goldpetal",rung:4,yield:4},{material:"Everbloom Pollen",rung:5,yield:5},
  ]},
  Root: { name:"Root Essence", sources:[
    {material:"Claybound Rootlets",rung:1,yield:1},{material:"Copper Ore",rung:2,yield:2},{material:"Stone",rung:2,yield:2},
    {material:"Iron Ingot",rung:3,yield:3},{material:"Alloy",rung:4,yield:4},{material:"Crystal Shard",rung:5,yield:5},
  ]},
  Vine: { name:"Vine Essence", sources:[
    {material:"Reed",rung:1,yield:1},{material:"Fiber",rung:2,yield:2},{material:"Rope",rung:3,yield:3},
    {material:"Cloth",rung:3,yield:3},{material:"Filament",rung:4,yield:4},{material:"Skyvine Silk",rung:5,yield:5},
  ]},
  Fungus: { name:"Fungus Essence", sources:[
    {material:"Wild Spores",rung:1,yield:1},{material:"Compost",rung:2,yield:2},{material:"Mycofiber",rung:3,yield:3},
    {material:"Iron Ore",rung:3,yield:3},{material:"Emberspore",rung:4,yield:4},{material:"Moonspore",rung:5,yield:5},
  ]},
  Pod: { name:"Pod Essence", sources:[
    {material:"Wild Seed",rung:1,yield:1},{material:"Farm Seed",rung:2,yield:2},{material:"Honey",rung:3,yield:3},
    {material:"Sap",rung:3,yield:3},{material:"Confection",rung:4,yield:4},{material:"Everbloom Seed",rung:5,yield:5},
  ]},
};

export const activityByRung = {
  1:"Foraged from the environment",
  2:"Cultivated, mined, or attracted",
  3:"Processed from raw materials",
  4:"Crafted from refined stock",
  5:"Discovered in rare regions",
};

export const materialCatalog = [
  ...Object.entries(essenceSources).map(([role,item]) => ({
    id:`essence-${role}`, name:item.name, rung:1, kind:"Role essence",
    origin:`Extracted from ${item.sources.length} compatible materials`,
    note:`Yield range: ${item.sources[0].yield}–${item.sources[item.sources.length-1].yield}`,
    spells:spells.filter(s=>s.role===role),
  })),
  ...Object.entries(materialsByRung).flatMap(([rung,names]) => names.map(name => {
    const extracted = Object.entries(essenceSources).find(([,item])=>item.sources.some(source=>source.material===name));
    const extraction = extracted?.[1].sources.find(source=>source.material===name);
    return {
      id:`material-${name}`, name, rung:Number(rung), kind:extracted ? "Essence source + spell material" : "Spell material",
      origin:activityByRung[rung],
      note:extracted ? `Extracts into ${extraction.yield} ${extracted[1].name}` : "",
      spells:spells.filter(s=>s.material===name),
    };
  })),
];

export const fizzle = {
  "Bloom|Darkness":"Flowers will not take in the dark.",
  "Pod|Darkness":"Fruit will not ripen without light.",
  "Root|Sunlight":"Roots want darkness, not open sun.",
  "Fungus|Sunlight":"Fungi wither in direct sun.",
};

// Resolve a role + material + catalyst combination against the authored
// spellbook, exactly like the Recipe Garden does.
export function resolveRecipe(recipe, conditions) {
  const result = spells.find(s => s.role === recipe.role && s.material === recipe.material && s.catalyst === recipe.catalyst);
  const fizzleReason = fizzle[`${recipe.role}|${recipe.catalyst}`];
  const requirements = result ? spellRequirements(result) : Object.fromEntries(conditionNames.map(name=>[name,0]));
  const deficits = conditionNames.filter(name => conditions[name] < requirements[name]);
  if (result && deficits.length) return { type:"dormant", spell:result, reason:deficits.map(name=>`${name}: needs ${requirements[name]}, has ${conditions[name]}`).join(" · ") };
  if (result) return { type:"success", spell:result };
  if (fizzleReason) return { type:"fizzle", reason:fizzleReason };
  return { type:"unknown", reason:"No authored spell uses this combination yet." };
}
