import { useState, useRef, useEffect } from "react";
import { CoinVertical } from "@phosphor-icons/react/CoinVertical";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { Trash } from "@phosphor-icons/react/Trash";
import { roleMarks, essenceSources } from "../data/spellSystem.js";
import { ARTIFACTS, ENERGY_TYPES, ESSENCE_RECIPES, ESSENCE_OF_ROLE, ENERGY_TINT, CROPS } from "./GameEngine.js";
import { NODE_COLUMN } from "./sprites.js";
import { getMaterialIconDataUrl } from "./materialIcons.js";
import resourceNodesUrl from "./assets/sheet_resource_nodes.png";
import { farmMap, caveMap, forestMap, townMap, ZONE_NAMES } from "./maps.js";

// Reverse essenceSources (spellSystem.js) into a material -> role lookup for
// the richer materials-bar/inventory tooltip — every plantable material maps
// to exactly one role's essence source list.
const MATERIAL_ROLE = Object.fromEntries(
  Object.entries(essenceSources).flatMap(([role, info]) => info.sources.map(src => [src.material, role]))
);

// sheet_resource_nodes.png's grid, per sprites.js: 5 materials x (full, depleted).
const NODE_SHEET_COLS = 5, NODE_SHEET_ROWS = 2;

// Crafting resources (wand-siphoned energy + distilled essence) that must never
// appear in the plantable seed materials-bar.
const NON_SEED_ITEMS = new Set([...ENERGY_TYPES, ...Object.values(ESSENCE_OF_ROLE)]);

// One-line flavor text shown in the richer materials-bar/inventory tooltip
// for materials tied to an essence role — everything else just shows its
// name (still better than nothing, and every material at least gets a real
// icon now, see MaterialIcon below).
const ROLE_NOTE = { Bloom: "Bloom essence source", Root: "Root essence source", Vine: "Vine essence source", Fungus: "Fungus essence source", Pod: "Pod essence source" };

// Small per-item icon shared by the horizontal materials bar and the full
// inventory grid: crops the real sprite-sheet cell for materials that have
// one (the 5 farm forage types), or falls back to a generalized hand-drawn
// procedural icon (materialIcons.js) for everything else, so every item
// always shows something distinct rather than a flat color swatch.
function MaterialIcon({ name }) {
  const col = NODE_COLUMN[name];
  if (col === undefined) {
    return <span className="material-icon procedural" style={{ backgroundImage: `url(${getMaterialIconDataUrl(name)})` }} />;
  }
  return (
    <span
      className="material-icon sprite"
      style={{
        backgroundImage: `url(${resourceNodesUrl})`,
        backgroundPosition: `${(col / (NODE_SHEET_COLS - 1)) * 100}% 0%`,
        backgroundSize: `${NODE_SHEET_COLS * 100}% ${NODE_SHEET_ROWS * 100}%`,
      }}
    />
  );
}

// Which inventory item a spell's cast would consume (mirrors the engine's
// reagentName): "self" = its own material, "role" = any owned material of its
// role, else the explicit name. Returns null if the spell has no material cost
// or nothing suitable is owned.
function reagentForCast(spell, inventory) {
  const spec = spell?.cast?.cost?.material;
  if (!spec) return null;
  if (spec === "self") return inventory[spell.material] > 0 ? spell.material : spell.material;
  if (spec === "role") { for (const name of Object.keys(inventory)) if (inventory[name] > 0 && MATERIAL_ROLE[name] === spell.role) return name; return null; }
  return spec;
}

// A short, human label for a cast descriptor's cost, shown on spellbook entries.
function castCostLabel(cast) {
  if (!cast) return "";
  const c = cast.cost || {};
  const parts = [];
  if (c.material === "self") parts.push("1 seed");
  else if (c.material === "role") parts.push("1 role material");
  else if (c.material) parts.push(`1 ${c.material}`);
  if (c.stamina) parts.push(`${c.stamina} stamina`);
  if (c.cooldown) parts.push(`${c.cooldown}d cooldown`);
  return parts.join(" · ");
}

export function Hud({
  snapshot, showWand, onSelectWand, onAdvanceDay, onSelectMaterial, onSelectMaterialSlot,
  showSpellbook, onOpenSpellbook, onCloseSpellbook,
  showInventory, onOpenInventory, onCloseInventory,
  onCloseShop, onBuyMaterial, onBuyRungUnlock, onBuyUpgrade,
  onOpenPot, onClosePot, onCombinePot, onExtractEssence,
  onDiscard, onMoveSlot, onTrashSlot, onSiphon, onSelectEnergy, onCraftEssence,
  onEquipWand, onMoveWand, onUnequipWand,
  onAssignItemHotbar, onMoveItemHotbar, onClearItemHotbar,
  onEquipArtifact, onUnequipArtifact,
  onCloseQuestBoard, onClaimQuest,
  onOpenMap, onCloseMap,
}) {
  const {
    zoneName, day, season, gold, inventory, artifact, wand, wandSlots, wandIndex, itemHotbar, selectedMaterial,
    selectedEnergy, prompt, log, spellbook, shopOpen, shopListings, rungUnlockPrice, upgrades,
    completed, spellsKnown, spellsTotal, stamina, maxStamina, weather,
    reputation, questBoardOpen, quests, potOpen,
    blightRemaining, shopPremiumLocked, premiumRepNeeded,
    mapOpen, playerTile, zone, maxRungUnlocked,
    castPrompt, mastery, spellCooldowns,
    invSlots, invCols, ritualGuide,
    heldSpell, shippingBin,
  } = snapshot;

  const binItems = Object.entries(shippingBin || {}).filter(([, n]) => n > 0);

  // The currently-equipped spell and, if it carries an active ability, the
  // inventory item its cast would consume — used to highlight that chip in the
  // materials bar so "what this cast needs" is visible before pressing F.
  const equipped = wand[wandIndex] || null;
  const castReagent = reagentForCast(equipped, inventory);
  const [completionDismissed, setCompletionDismissed] = useState(false);

  return (
    <>
      <div className="hud-top">
        <span className="hud-zone">{zoneName}</span>
        <span className="hud-day"><CalendarBlank /> Day {day} · {season}</span>
        {weather && weather !== "Clear" && (
          <span className={`hud-weather ${weather.toLowerCase()}`} title={weather === "Drought" ? "Drought: streams run dry, Water recipes go dormant" : "Rain: Water is plentiful today"}>
            {weather === "Drought" ? "☀ Drought" : "☂ Rain"}
          </span>
        )}
        <span className="hud-stamina" title="Stamina — spent by tilling, mining, and foraging; restored by advancing the day">
          <span className="hud-stamina-bar"><span className="hud-stamina-fill" style={{ width: `${Math.max(0, Math.min(100, (stamina / maxStamina) * 100))}%` }} /></span>
          <span className="hud-stamina-num">{Math.round(stamina)}</span>
        </span>
        <span className="hud-gold"><CoinVertical weight="fill" /> {gold}g</span>
        <span className="hud-rep" title="Reputation with the townsfolk — earned by fulfilling notice-board requests">★ {reputation} rep</span>
        {blightRemaining > 0 && (
          <span className="hud-blight" title="The Withering — blighted farm tiles. Cast a role-matching spell on one to cleanse it for gold + reputation. Blight slows adjacent crops.">✦ {blightRemaining} blight</span>
        )}
        <span className="hud-spells" title="Spells discovered — find every one to complete the grimoire">Spells {spellsKnown}/{spellsTotal}</span>
        {heldSpell && (
          <span className={`hud-held-spell ${heldSpell.role.toLowerCase()}`} title={`Holding ${heldSpell.name} — aim at a target and press F (or click it) to cast`}>
            ✋ {roleMarks[heldSpell.role]} {heldSpell.name}
          </span>
        )}
        {binItems.length > 0 && (
          <span className="hud-bin" title={`Shipping bin — sold at day rollover:\n${binItems.map(([n, c]) => `${c}× ${n}`).join("\n")}`}>
            ▣ Bin {binItems.reduce((a, [, c]) => a + c, 0)}
          </span>
        )}
        <button className="hud-icon-btn" onClick={onOpenMap} title="World map (M)">Map</button>
        {(inventory.Pot > 0) && <button className="hud-icon-btn" onClick={onOpenPot} title="Open your Pot to brew a spell (C)">Pot</button>}
        <button className="hud-icon-btn" onClick={onOpenInventory} title="Inventory (I)">Inventory</button>
        <button className="hud-icon-btn" onClick={onOpenSpellbook} title="Spellbook (B)">Spellbook</button>
        <button className="hud-advance" onClick={onAdvanceDay}>Advance Day (N)</button>
      </div>

      <CornerMiniMap zone={zone} player={playerTile} onExpand={onOpenMap} />

      <div className="hud-log">
        {log.slice().reverse().map((line, i) => <div key={log.length - i} className="hud-log-line">{line}</div>)}
      </div>

      {ritualGuide && <RitualGuide guide={ritualGuide} />}

      {/* Minecraft-style layout: a slim horizontal materials bar sits just
          above the spell hotbar, always visible; press I for the full
          grid (see InventoryPanel) the same way E opens Minecraft's inventory.
          Materials are click-selectable here — the selected one is what
          plant() (P, or clicking tilled soil) plants as a seed; no separate
          menu is ever shown for this. The in-world prompt lives inside this
          dock (anchored to its top edge) so it hovers over the bottom of the
          canvas rather than over the controls now that the dock is in flow. */}
      <div className="hud-bottom-dock">
        {prompt && <div className="hud-prompt">{prompt}</div>}
        {castPrompt && <div className="hud-cast-prompt">{castPrompt}</div>}
        <div className="hud-wand-row">
          <button className="hud-wand-btn" onClick={onSiphon} title="Draw an ambient catalyst at your feet (G) — Sunlight/Water/Darkness/Moonlight/Snowfall depending on where you stand">
            <span className="hud-wand-icon">✦</span> Draw catalyst (G)
          </button>
          <div className="hud-energy-strip">
            {ENERGY_TYPES.map(name => {
              const have = inventory[name] || 0;
              return (
                <button
                  key={name}
                  className={`hud-energy-pill${have ? " has" : ""}${name === selectedEnergy ? " selected" : ""}`}
                  style={have ? { borderColor: ENERGY_TINT[name], color: ENERGY_TINT[name] } : undefined}
                  title={have ? `${name} catalyst — select it, plus a material, then click the Pot to brew a spell` : `${name} catalyst — draw some from the wild with G`}
                  onClick={() => have && onSelectEnergy(name)}
                >
                  {name} {have}
                </button>
              );
            })}
          </div>
        </div>
        {/* The Wand's equipped spells — hidden by default, revealed with Tab
            (or when switching with 1–{wandSlots}). Spells are never a permanent
            part of the hotbar; this is a temporary overlay. */}
        {showWand && (
          <div className="hud-wand-reveal">
            <span className="hud-wand-reveal-label">Wand · press 1–{wandSlots} or click · Tab to hide</span>
            <div className="hud-hotbar">
              {wand.map((spell, i) => {
                if (!spell) {
                  return (
                    <button
                      key={i}
                      className={`hud-slot empty${i === wandIndex ? " active" : ""}`}
                      onClick={() => onSelectWand(i)}
                      title="Empty wand slot — open Inventory (I) → Wand to equip a spell here"
                    >
                      <span className="hud-slot-key">{i + 1}</span>
                    </button>
                  );
                }
                const lvl = mastery?.[spell.id]?.level || 1;
                const cd = spellCooldowns?.[spell.id] || 0;
                return (
                  <button
                    key={i}
                    className={`hud-slot${i === wandIndex ? " active" : ""}${cd > 0 ? " cooling" : ""}`}
                    onClick={() => onSelectWand(i)}
                    title={`${spell.effect}${spell.cast ? ` · Cast (F): ${castCostLabel(spell.cast)}` : ""} · Mastery Lv ${lvl}`}
                  >
                    <span className="hud-slot-key">{i + 1}</span>
                    <span className={`hud-slot-role ${spell.role.toLowerCase()}`}>{roleMarks[spell.role]}</span>
                    <span className="hud-slot-name">{spell.name}</span>
                    {spell.cast && <span className="hud-slot-cast">F</span>}
                    {lvl > 1 && <span className="hud-slot-mastery">L{lvl}</span>}
                    {cd > 0 && <span className="hud-slot-cd">{cd}d</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Item hotbar — a fixed Minecraft-style row of MATERIAL icons mirrored
            from the bag (arranged in the Inventory's Items tab). Icon-only: hover
            for the name, click to select that seed for planting. */}
        <div className="hud-item-hotbar">
          {itemHotbar.map((slot, i) => {
            if (!slot) {
              return <div key={i} className="hud-item-slot empty" title="Empty item slot — link a material from the Inventory (I)" />;
            }
            const { name, count } = slot;
            return (
              <button
                key={i}
                className={`hud-item-slot${name === selectedMaterial ? " selected" : ""}${name === castReagent ? " reagent" : ""}${count <= 0 ? " depleted" : ""}`}
                data-tooltip={`${name} — ${ROLE_NOTE[MATERIAL_ROLE[name]] || "material"}${name === castReagent ? " · this spell's cast reagent" : ""}`}
                onClick={() => onSelectMaterialSlot(name)}
              >
                <MaterialIcon name={name} />
                {count > 0 && <span className="hud-item-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hud-help">WASD/Arrows to move · T till soil, then select a crop seed and press P (or click soil) to plant · G draws an ambient catalyst · press C to open your Pot, pick a material + a catalyst, and Brew a spell — brewed spells are held in hand · press Tab (or 1–{wandSlots}) to switch the held spell · F casts it: a Grow spell hurries a crop, a Mine spell breaks a cave rock · harvest ripe crops, select one and click the shipping Bin (B) to ship it, then press N to sell overnight · extract a harvested crop into Essence in the Pot · E interact · C pot · I inventory · B spellbook · N advance day</div>

      {showSpellbook && <SpellbookPanel spellbook={spellbook} onClose={onCloseSpellbook} />}
      {showInventory && (
        <InventoryPanel
          inventory={inventory}
          invSlots={invSlots}
          invCols={invCols}
          wand={wand}
          wandSlots={wandSlots}
          wandIndex={wandIndex}
          itemHotbar={itemHotbar}
          selectedMaterial={selectedMaterial}
          spellbook={spellbook}
          artifact={artifact}
          onClose={onCloseInventory}
          onMoveSlot={onMoveSlot}
          onTrashSlot={onTrashSlot}
          onCraftEssence={onCraftEssence}
          onEquipWand={onEquipWand}
          onMoveWand={onMoveWand}
          onUnequipWand={onUnequipWand}
          onAssignItemHotbar={onAssignItemHotbar}
          onMoveItemHotbar={onMoveItemHotbar}
          onClearItemHotbar={onClearItemHotbar}
          onSelectMaterialSlot={onSelectMaterialSlot}
          onEquipArtifact={onEquipArtifact}
          onUnequipArtifact={onUnequipArtifact}
        />
      )}
      {shopOpen && (
        <ShopPanel
          gold={gold}
          listings={shopListings}
          rungUnlockPrice={rungUnlockPrice}
          upgrades={upgrades}
          shopPremiumLocked={shopPremiumLocked}
          premiumRepNeeded={premiumRepNeeded}
          reputation={reputation}
          onClose={onCloseShop}
          onBuyMaterial={onBuyMaterial}
          onBuyRungUnlock={onBuyRungUnlock}
          onBuyUpgrade={onBuyUpgrade}
        />
      )}
      {potOpen && (
        <PotPanel
          inventory={inventory}
          onClose={onClosePot}
          onCombine={onCombinePot}
          onExtract={onExtractEssence}
        />
      )}
      {questBoardOpen && (
        <QuestBoardPanel
          quests={quests}
          reputation={reputation}
          onClose={onCloseQuestBoard}
          onClaimQuest={onClaimQuest}
        />
      )}
      {mapOpen && (
        <MapPanel
          zone={zone}
          playerTile={playerTile}
          maxRungUnlocked={maxRungUnlocked}
          onClose={onCloseMap}
        />
      )}
      {completed && !completionDismissed && <CompletionBanner onClose={() => setCompletionDismissed(true)} />}
    </>
  );
}

// The town notice board — Millbrook's second pillar scaffold. Same overlay +
// backdrop pattern as the Shop, opened by clicking the "q" board tile. Lists
// the townsfolk's open requests (deliver a Pod fruit, or discover a spell of
// a given role); a fulfilled one can be claimed for gold + reputation, and a
// fresh request rotates in to replace it.
function QuestBoardPanel({ quests, reputation, onClose, onClaimQuest }) {
  return (
    <div className="inventory-overlay" onClick={onClose}>
      <div className="inventory-panel" onClick={e => e.stopPropagation()}>
        <div className="inventory-title">
          <h3>Town Notice Board — ★ {reputation} rep</h3>
          <button className="inventory-close" onClick={onClose}>Close</button>
        </div>

        <span className="hud-label">Open requests from the townsfolk</span>
        <div className="quest-list">
          {quests.length ? quests.map(q => {
            const title = q.kind === "deliver"
              ? `Deliver ${q.qty}× ${q.target}`
              : `Discover a ${q.target} spell`;
            const progress = q.kind === "deliver" ? `${Math.min(q.have, q.qty)}/${q.qty} in satchel` : (q.done ? "Discovered!" : "Not yet discovered");
            return (
              <div key={q.id} className={q.done ? "quest-card done" : "quest-card"}>
                <div className="quest-card-body">
                  <span className="quest-card-title">{title}</span>
                  <span className="quest-card-progress">{progress}</span>
                  <span className="quest-card-reward">Reward: {q.reward.gold}g · +{q.reward.rep} rep</span>
                </div>
                <button className="quest-claim" disabled={!q.done} onClick={() => onClaimQuest(q.id)}>
                  {q.done ? "Claim" : "In progress"}
                </button>
              </div>
            );
          }) : <span className="hud-inv-empty">No open requests right now — check back after discovering more.</span>}
        </div>
        <span className="hud-inv-empty" style={{ marginTop: 8, display: "block" }}>
          Reputation banks toward opening the blighted regions beyond Millbrook.
        </span>
      </div>
    </div>
  );
}

// Essence item name -> role, so a distilled/extracted Essence shows its role
// mark in the Pot and counts as a brewable material.
const ESSENCE_TO_ROLE = Object.fromEntries(Object.entries(ESSENCE_OF_ROLE).map(([role, name]) => [name, role]));
const ESSENCE_NAMES = new Set(Object.values(ESSENCE_OF_ROLE));
// The role a brewable material belongs to (a foraged/mined material, or an
// extracted role Essence). Returns null for anything that can't be brewed.
function brewRoleOf(name) {
  return MATERIAL_ROLE[name] || ESSENCE_TO_ROLE[name] || null;
}

// The Pot's combine GUI — a held item's interface (opened with C / the Pot
// button), NOT a world tile. Two explicit, separately-labelled slots make the
// material vs. catalyst distinction unambiguous: pick one brewable material and
// one catalyst, then Brew to resolve a spell. A crop can instead be extracted
// into its role Essence. Same overlay/backdrop pattern as the Shop.
function PotPanel({ inventory, onClose, onCombine, onExtract }) {
  const [selMat, setSelMat] = useState(null);
  const [selCat, setSelCat] = useState(null);

  const owned = Object.entries(inventory).filter(([, n]) => n > 0);
  const materials = owned.filter(([name]) => brewRoleOf(name));
  const catalysts = ENERGY_TYPES.filter(name => (inventory[name] || 0) > 0);
  const crops = owned.filter(([name]) => CROPS[name]);

  // Drop a selection if that stack ran out on a refresh.
  useEffect(() => { if (selMat && !(inventory[selMat] > 0)) setSelMat(null); }, [inventory, selMat]);
  useEffect(() => { if (selCat && !(inventory[selCat] > 0)) setSelCat(null); }, [inventory, selCat]);

  const canBrew = selMat && selCat;

  return (
    <div className="inventory-overlay" onClick={onClose}>
      <div className="inventory-panel pot-panel" onClick={e => e.stopPropagation()}>
        <div className="inventory-title">
          <h3>Brewing Pot</h3>
          <button className="inventory-close" onClick={onClose}>Close (C)</button>
        </div>

        <div className="pot-slots">
          <div className="pot-slot-group">
            <span className="hud-label">Material</span>
            <div className="pot-chip-row">
              {materials.length ? materials.map(([name, count]) => {
                const role = brewRoleOf(name);
                return (
                  <button
                    key={name}
                    className={`pot-chip${selMat === name ? " selected" : ""}`}
                    onClick={() => setSelMat(selMat === name ? null : name)}
                    title={`${name} — ${role} material`}
                  >
                    <span className={`hud-slot-role ${role.toLowerCase()}`}>{roleMarks[role]}</span>
                    <MaterialIcon name={name} />
                    <span className="pot-chip-name">{name}</span>
                    <span className="pot-chip-count">{count}</span>
                  </button>
                );
              }) : <span className="hud-inv-empty">No brewable materials — forage some, or extract a crop below.</span>}
            </div>
          </div>

          <div className="pot-plus">+</div>

          <div className="pot-slot-group">
            <span className="hud-label">Catalyst</span>
            <div className="pot-chip-row">
              {catalysts.length ? catalysts.map(name => (
                <button
                  key={name}
                  className={`pot-chip${selCat === name ? " selected" : ""}`}
                  style={{ borderColor: ENERGY_TINT[name] }}
                  onClick={() => setSelCat(selCat === name ? null : name)}
                  title={`${name} catalyst`}
                >
                  <span className="pot-chip-name" style={{ color: ENERGY_TINT[name] }}>{name}</span>
                  <span className="pot-chip-count">{inventory[name]}</span>
                </button>
              )) : <span className="hud-inv-empty">No catalysts — press G in the world to draw Sunlight/Water/etc.</span>}
            </div>
          </div>
        </div>

        <button
          className="pot-brew-btn"
          disabled={!canBrew}
          onClick={() => onCombine(selMat, selCat)}
        >
          {canBrew ? `Brew ${selMat} + ${selCat}` : "Pick a material and a catalyst"}
        </button>
        <span className="mc-inv-hint">A brewed spell lands in your hand — press F in the world to cast it. Unknown combinations still teach you a clue.</span>

        {crops.length > 0 && (
          <>
            <span className="hud-label" style={{ marginTop: 14 }}>Extract a crop into Essence</span>
            <div className="pot-chip-row">
              {crops.map(([name, count]) => (
                <button key={name} className="pot-chip extract" onClick={() => onExtract(name)} title={`Extract ${name} into ${ESSENCE_OF_ROLE[CROPS[name].essenceRole]}`}>
                  <MaterialIcon name={name} />
                  <span className="pot-chip-name">{name} → {CROPS[name].essenceRole} Essence</span>
                  <span className="pot-chip-count">{count}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- World map overlay ----------
// Per-zone base palette for the schematic minimaps (floor + border), so each
// area reads at a glance: green farm, grey mine, dark-green wildwood, tan town.
const ZONE_MINI = {
  farm:   { floor: "#5a8a3c", wall: "#33502a" },
  cave:   { floor: "#6b6459", wall: "#3a3330" },
  forest: { floor: "#2f5a34", wall: "#1e3a22" },
  town:   { floor: "#c9b98a", wall: "#5c4a34" },
};
// Shared special-tile colors, keyed by the same map.js single-char tile codes:
// water/fountain, each forage/ore node, structures, gates/exits, and hazards.
const MINI_SPECIAL = {
  "~": "#3f7bd6",
  f: "#e06fae", u: "#b07fce", b: "#d64b4b", d: "#b07a3a", w: "#5fa04a",
  g: "#d8c24a", i: "#7fae5a", y: "#c98a3a",
  o: "#8a8278", x: "#d0a24a",
  k: "#e9c14a", s: "#c88a4a", p: "#7a6a4a", m: "#e9c14a", q: "#c2a878", c: "#20242a",
  "=": "#b09a6a", e: "#e9c14a",
  v: "#e0663a", r: "#7a5a4a",
};
function miniColor(zoneKey, ch) {
  const z = ZONE_MINI[zoneKey];
  if (ch === "#") return z.wall;
  if (ch === ".") return z.floor;
  return MINI_SPECIAL[ch] ?? z.floor;
}

// Current-zone tile grids, keyed like ZONE_NAMES, for the always-on corner
// minimap and the full-map overlay.
const ZONE_TILES = { farm: farmMap, cave: caveMap, forest: forestMap, town: townMap };

// Always-on corner minimap: a compact schematic of just the zone the player is
// currently in, with a live red pip at their tile. Redraws every HUD poll
// (~120ms) so the pip tracks movement. pointer-events are disabled in CSS so
// it never eats a world click underneath it.
// Persistent step-by-step guide for the planting ritual — shown while the
// player faces a farmable tile (see GameEngine.computeRitualGuide). Completed
// steps get a check, the current step is highlighted and carries a live "do
// this now" line, and upcoming steps are dimmed, so the whole till → seed →
// essence → energy → magic → harvest sequence is always legible.
function RitualGuide({ guide }) {
  const { steps, detail } = guide;
  return (
    <div className="ritual-guide">
      <div className="ritual-guide-title">Planting Ritual</div>
      <ol className="ritual-guide-steps">
        {steps.map((s, i) => (
          <li
            key={i}
            className={`ritual-step${s.done ? " done" : ""}${s.active ? " active" : ""}`}
          >
            <span className="ritual-step-mark">{s.done ? "✓" : i + 1}</span>
            <span className="ritual-step-label">{s.label}</span>
          </li>
        ))}
      </ol>
      {detail && <div className="ritual-guide-detail">{detail}</div>}
    </div>
  );
}

function CornerMiniMap({ zone, player, onExpand }) {
  const tiles = ZONE_TILES[zone];
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !tiles) return;
    const ctx = canvas.getContext("2d");
    const h = tiles.length, w = tiles[0].length;
    const S = Math.max(3, Math.round(132 / w)); // scale so the widest zone ~132px
    canvas.width = w * S;
    canvas.height = h * S;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y++) {
      const row = tiles[y];
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = miniColor(zone, row[x]);
        ctx.fillRect(x * S, y * S, S, S);
      }
    }
    if (player) {
      const cx = (player.x + 0.5) * S, cy = (player.y + 0.5) * S;
      ctx.fillStyle = "#fff7d6";
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.5, S * 0.85), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e0402e";
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, S * 0.5), 0, Math.PI * 2); ctx.fill();
    }
  }, [zone, tiles, player]);
  return (
    <button type="button" className="minimap" onClick={onExpand} title="Open full world map (M)">
      <div className="minimap-title">{ZONE_NAMES[zone]}</div>
      <canvas ref={ref} className="minimap-canvas" />
      <div className="minimap-hint">Click · M — full map</div>
    </button>
  );
}

// One tile == one scaled pixel-block, drawn straight onto a small canvas. The
// player marker (a red pip) is only drawn on the zone the player is currently
// standing in. Movement is blocked while the map overlay is open, so a single
// draw per mount/poll is enough (no animation loop needed).
function MiniMap({ zoneKey, tiles, current, player }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const h = tiles.length, w = tiles[0].length, S = 8;
    canvas.width = w * S;
    canvas.height = h * S;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y++) {
      const row = tiles[y];
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = miniColor(zoneKey, row[x]);
        ctx.fillRect(x * S, y * S, S, S);
      }
    }
    if (current && player) {
      const cx = (player.x + 0.5) * S, cy = (player.y + 0.5) * S;
      ctx.fillStyle = "#fff7d6";
      ctx.beginPath(); ctx.arc(cx, cy, S * 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e0402e";
      ctx.beginPath(); ctx.arc(cx, cy, S * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }, [zoneKey, tiles, current, player]);
  return <canvas ref={ref} className="map-canvas" />;
}

// Geographic layout of the four zones: the Farm is the hub, joined by roads —
// the Wildwood road runs off the west edge, the Millbrook road off the east
// edge, and the mine is entered from the farm's east side (see the road-mouths
// in maps.js / ZONE_EXITS).
const MAP_LAYOUT = [
  { key: "forest", tiles: forestMap, col: 1, row: 1, note: "West road — rung-2 bramble block" },
  { key: "farm",   tiles: farmMap,   col: 2, row: 1, note: "Home — the hub of Millbrook" },
  { key: "town",   tiles: townMap,   col: 3, row: 1, note: "East road — shop & notice board" },
  { key: "cave",   tiles: caveMap,   col: 2, row: 2, note: "The mine — entered from the farm" },
];

// Read-only atlas of the whole world (M / the Map button). Same overlay +
// backdrop pattern as the other menus; never teleports — travel is by walking
// through gate tiles.
function MapPanel({ zone, playerTile, maxRungUnlocked, onClose }) {
  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="map-panel" onClick={e => e.stopPropagation()}>
        <div className="inventory-title">
          <h3>World Map — you are in {ZONE_NAMES[zone]}</h3>
          <button className="inventory-close" onClick={onClose}>Close</button>
        </div>
        <div className="map-grid">
          {MAP_LAYOUT.map(z => {
            const current = z.key === zone;
            const locked = z.key === "forest" && maxRungUnlocked < 2;
            return (
              <div
                key={z.key}
                className={current ? "map-zone current" : "map-zone"}
                style={{ gridColumn: z.col, gridRow: z.row }}
              >
                <div className="map-zone-head">
                  <span className="map-zone-name">{ZONE_NAMES[z.key]}</span>
                  {current && <span className="map-here">You are here</span>}
                  {locked && <span className="map-locked">Locked · rung 2</span>}
                </div>
                <MiniMap zoneKey={z.key} tiles={z.tiles} current={current} player={playerTile} />
                <span className="map-zone-note">{z.note}</span>
              </div>
            );
          })}
        </div>
        <div className="map-legend">
          <span><i className="map-key" style={{ background: "#3f7bd6" }} />Water</span>
          <span><i className="map-key" style={{ background: "#e9c14a" }} />Landmark / gate</span>
          <span><i className="map-key" style={{ background: "#d64b4b" }} />Forage / ore</span>
          <span><i className="map-key" style={{ background: "#e0402e" }} />You</span>
        </div>
        <span className="hud-inv-empty" style={{ marginTop: 6, display: "block" }}>
          Walk through a gate tile to travel — the map is a guide, it doesn't move you. Press M or Esc to close.
        </span>
      </div>
    </div>
  );
}

// The Wand is a held item, not a menu tab — it sits among your things like any
// material. Hovering reveals the spells currently equipped into it; clicking it
// opens the wand's spell GUI (see the wandOpen popup), the Minecraft-style
// "use the item to open its interface". Spells are equipped INTO the wand and
// never carried as loose items.
function WandSection({ wand, onOpenWand }) {
  const equipped = (wand || []).filter(Boolean);
  const total = (wand || []).length;
  return (
    <div className="inv-wand-section">
      <span className="hud-label">Wand</span>
      <div className="inv-wand-item" tabIndex={0} onClick={onOpenWand} title="Click to open your wand and equip spells">
        <span className="wand-item-icon">✦</span>
        <div className="wand-item-label">
          <span className="wand-item-name">Aether Wand</span>
          <span className="wand-item-count">{equipped.length}/{total} spells equipped</span>
        </div>
        <div className="wand-tooltip">
          <strong>Equipped spells</strong>
          {equipped.length ? equipped.map(s => (
            <div key={s.id} className="wand-tooltip-row">
              <span className={`hud-slot-role ${s.role.toLowerCase()}`}>{roleMarks[s.role]}</span>
              <span className="wand-tooltip-name">{s.name}</span>
              {s.cast && <span className="hud-slot-cast">F</span>}
            </div>
          )) : <em className="wand-tooltip-empty">No spells equipped — click to open your wand.</em>}
        </div>
      </div>
    </div>
  );
}

// A real equippable good, distinct from stackable materials — consumes the
// source material to equip, returns it to inventory on unequip (see
// GameEngine.js: equipArtifact/unequipArtifact).
function ArtifactSection({ inventory, artifact, onEquipArtifact, onUnequipArtifact }) {
  const owned = Object.keys(ARTIFACTS).filter(name => (inventory[name] || 0) > 0);
  return (
    <>
      <span className="hud-label" style={{ marginTop: 14 }}>Artifact</span>
      <div className="inventory-grid">
        {artifact && (
          <div className="inventory-slot artifact equipped" title={ARTIFACTS[artifact].effect}>
            <MaterialIcon name={artifact} />
            <span className="inventory-slot-name">{ARTIFACTS[artifact].name}</span>
            <button className="inventory-action" onClick={onUnequipArtifact}>Unequip</button>
          </div>
        )}
        {owned.map(name => (
          <div key={name} className="inventory-slot artifact" title={ARTIFACTS[name].effect}>
            <MaterialIcon name={name} />
            <span className="inventory-slot-name">{ARTIFACTS[name].name}</span>
            <button className="inventory-action" onClick={() => onEquipArtifact(name)}>Equip</button>
          </div>
        ))}
        {!artifact && !owned.length && <span className="hud-inv-empty">No artifacts yet — Rung 4-5 spells yield Alloy/Moonspore.</span>}
      </div>
    </>
  );
}

// The full Minecraft-style inventory screen — a grid of slots opened with I,
// separate from the always-visible horizontal materials bar above the
// hotbar. Backdrop + click-outside-to-close, same pattern as the Spellbook.
// Beyond read-only display, each material slot now has a Discard action, and
// a separate Artifact section supports equip/unequip directly from here.
function InventoryPanel({
  inventory, invSlots, invCols, wand, wandSlots, wandIndex, itemHotbar, selectedMaterial, spellbook,
  artifact, onClose, onMoveSlot, onTrashSlot, onCraftEssence,
  onEquipWand, onMoveWand, onUnequipWand,
  onAssignItemHotbar, onMoveItemHotbar, onClearItemHotbar, onSelectMaterialSlot,
  onEquipArtifact, onUnequipArtifact,
}) {
  const slots = invSlots || [];
  const cols = invCols || 6;
  const hb = itemHotbar || [];
  const wandBar = wand || [];
  const wandIds = wandBar.map(s => (s ? s.id : null));
  const knownSpells = (spellbook || []).filter(s => s.known);
  const [tab, setTab] = useState("items");
  // Three independent "grabbed onto the cursor" states, each following the mouse:
  //  • held      — a storage-grid slot index (Items tab bag grid).
  //  • heldHb    — { name, from } a material grabbed to arrange the item hotbar
  //    (from = hotbar slot index, or null when linked from the storage grid).
  //  • heldSpell — { spellId, from } a spell being equipped into the Wand
  //    (from = wand slot index, or null when grabbed out of the spell palette).
  const [held, setHeld] = useState(null);
  const [heldHb, setHeldHb] = useState(null);
  const [heldSpell, setHeldSpell] = useState(null);
  // The wand's spell menu is a Minecraft-style item GUI: it pops open when you
  // click the Aether Wand item (no dedicated inventory tab), overlaying the bag.
  const [wandOpen, setWandOpen] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const heldItem = held != null ? slots[held] : null;
  const heldSpellObj = heldSpell ? knownSpells.find(s => s.id === heldSpell.spellId) : null;

  // If a grabbed material stack vanishes on a snapshot refresh, drop the grab.
  useEffect(() => { if (held != null && !slots[held]) setHeld(null); }, [held, slots]);
  // Leaving the Items tab cancels an in-progress storage grab. The item-hotbar
  // grab clears too since its row lives in the Items tab. The wand-spell grab
  // clears when leaving the Wand tab.
  useEffect(() => { if (tab !== "items") { setHeld(null); setHeldHb(null); setWandOpen(false); } }, [tab]);
  // Closing the wand GUI drops any spell grabbed inside it.
  useEffect(() => { if (!wandOpen) setHeldSpell(null); }, [wandOpen]);

  // ---- storage grid (the bag): move/trash whole stacks ----
  const pickOrDrop = i => {
    if (heldHb || heldSpell) return;
    if (held == null) { if (slots[i]) setHeld(i); }
    else if (i === held) setHeld(null);
    else { onMoveSlot(held, i); setHeld(null); }
  };

  // ---- item hotbar row: link/arrange material shortcuts ----
  const clickItemSlot = i => {
    if (heldSpell) return;
    if (held != null) {
      // Linking a storage stack to this hotbar slot (doesn't move the stack —
      // the hotbar just points at that material for quick planting selection).
      if (heldItem) onAssignItemHotbar(i, heldItem.name);
      setHeld(null);
      return;
    }
    if (heldHb) {
      if (heldHb.from != null) onMoveItemHotbar(heldHb.from, i);
      else onAssignItemHotbar(i, heldHb.name);
      setHeldHb(null);
      return;
    }
    if (hb[i]) { setHeldHb({ name: hb[i].name, from: i }); return; }
    // Empty slot, nothing held: no-op.
  };

  // ---- Wand tab: equip/arrange spells ----
  const pickSpellFromPalette = id => { if (held != null || heldHb) return; setHeldSpell(prev => (prev ? null : { spellId: id, from: null })); };
  const clickWandSlot = i => {
    if (held != null || heldHb) return;
    if (heldSpell) {
      if (heldSpell.from != null) onMoveWand(heldSpell.from, i);
      else onEquipWand(i, heldSpell.spellId);
      setHeldSpell(null);
    } else if (wandIds[i] != null) {
      setHeldSpell({ spellId: wandIds[i], from: i });
    }
  };

  const onBackdrop = () => {
    if (held != null) { setHeld(null); return; }
    if (heldHb) { setHeldHb(null); return; }
    if (heldSpell) { setHeldSpell(null); return; }
    onClose();
  };

  const onTrash = () => {
    if (held != null) { onTrashSlot(held); setHeld(null); return; }
    // Trashing a held hotbar material just unlinks it from the item hotbar (the
    // stack stays in the bag). Trashing a held wand spell unequips it (spells
    // are never deleted from the spellbook — they return to the palette).
    if (heldHb) { if (heldHb.from != null) onClearItemHotbar(heldHb.from); setHeldHb(null); return; }
    if (heldSpell) { if (heldSpell.from != null) onUnequipWand(heldSpell.from); setHeldSpell(null); }
  };

  const anyHeld = held != null || heldHb != null || heldSpell != null;
  const heldHbSlot = heldHb ? (inventory[heldHb.name] != null ? { name: heldHb.name, count: inventory[heldHb.name] } : { name: heldHb.name, count: 0 }) : null;

  return (
    <div
      className="inventory-overlay"
      onClick={onBackdrop}
      onMouseMove={e => anyHeld && setMouse({ x: e.clientX, y: e.clientY })}
    >
      <div className="inventory-panel" onClick={e => e.stopPropagation()}>
        <div className="inventory-title">
          <h3>Inventory</h3>
          <button className="inventory-close" onClick={onClose}>Close (I)</button>
        </div>

        <div className="inv-tabs">
          <button className={`inv-tab${tab === "items" ? " active" : ""}`} onClick={() => setTab("items")}>Items</button>
          <button className={`inv-tab${tab === "craft" ? " active" : ""}`} onClick={() => setTab("craft")}>Crafting</button>
        </div>

        {tab === "items" && (
          <>
            <div className="mc-inv-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {slots.map((slot, i) => (
                <button
                  key={i}
                  className={`mc-slot${slot ? " filled" : ""}${held === i ? " held" : ""}`}
                  data-tooltip={slot ? slot.name : undefined}
                  onClick={e => { e.stopPropagation(); pickOrDrop(i); }}
                >
                  {slot && (
                    <>
                      <MaterialIcon name={slot.name} />
                      {slot.count > 1 && <span className="mc-slot-count">{slot.count}</span>}
                    </>
                  )}
                </button>
              ))}
            </div>

            <div className="mc-inv-footer">
              <button
                className={`mc-trash${anyHeld ? " armed" : ""}`}
                onClick={e => { e.stopPropagation(); onTrash(); }}
                title="Drop a held stack here to delete it (a held hotbar shortcut just unlinks)"
              >
                <Trash weight="fill" />
                <span>Trash</span>
              </button>
              <span className="mc-inv-hint">
                {held != null
                  ? "Click a bag slot to place · click a hotbar slot to link it · Trash to delete"
                  : heldHb
                    ? "Click a hotbar slot to place · Trash to unlink · click away to cancel"
                    : "Click a stack to move/trash it · pick a hotbar slot to rearrange your seeds."}
              </span>
            </div>

            <WandSection wand={wandBar} onOpenWand={() => setWandOpen(true)} />
            <ArtifactSection inventory={inventory} artifact={artifact} onEquipArtifact={onEquipArtifact} onUnequipArtifact={onUnequipArtifact} />
          </>
        )}

        {tab === "craft" && <CraftingTab inventory={inventory} onCraftEssence={onCraftEssence} />}

        {/* The wand's spell GUI — opened by clicking the Aether Wand item (like
            using an item in Minecraft), not a tab. Equip spells INTO the wand;
            they're equipment, never carried as items. */}
        {wandOpen && (
          <div className="wand-gui-backdrop" onClick={e => { e.stopPropagation(); if (heldSpell) { if (heldSpell.from != null) onUnequipWand(heldSpell.from); setHeldSpell(null); } else setWandOpen(false); }}>
            <div className="wand-gui" onClick={e => e.stopPropagation()}>
              <div className="wand-gui-head">
                <span className="wand-gui-title"><span className="wand-item-icon">✦</span> Aether Wand</span>
                <button className="inventory-close" onClick={() => setWandOpen(false)}>Close</button>
              </div>
              <span className="hud-label">Click a spell, then a wand slot below to equip it. Spells are equipment, not items.</span>
              <div className="spell-palette">
                {knownSpells.length ? knownSpells.map(s => (
                  <button
                    key={s.id}
                    className={`spell-chip${wandIds.includes(s.id) ? " assigned" : ""}${heldSpell?.spellId === s.id ? " held" : ""}`}
                    onClick={e => { e.stopPropagation(); pickSpellFromPalette(s.id); }}
                    title={`${s.effect}${s.cast ? " · has an F-cast ability" : ""}`}
                  >
                    <span className={`hud-slot-role ${s.role.toLowerCase()}`}>{roleMarks[s.role]}</span>
                    <span className="spell-chip-name">{s.name}</span>
                    {s.cast && <span className="hud-slot-cast">F</span>}
                    {wandIds.includes(s.id) && <span className="spell-chip-on">equipped</span>}
                  </button>
                )) : <span className="hud-inv-empty">No spells known yet — discover them by planting.</span>}
              </div>

              <div className="inv-hotbar-label">Wand slots (keys 1–{wandSlots || wandBar.length})</div>
              <div className="inv-hotbar-row" style={{ gridTemplateColumns: `repeat(${wandBar.length}, 1fr)` }}>
                {wandBar.map((spell, i) => (
                  <button
                    key={i}
                    className={`mc-slot hotbar-slot${spell ? " filled" : ""}${heldSpell?.from === i ? " held" : ""}${i === wandIndex ? " active" : ""}`}
                    onClick={e => { e.stopPropagation(); clickWandSlot(i); }}
                    title={spell ? spell.name : "Empty wand slot"}
                  >
                    <span className="mc-slot-key">{i + 1}</span>
                    {spell && (
                      <>
                        <span className={`hud-slot-role ${spell.role.toLowerCase()}`}>{roleMarks[spell.role]}</span>
                        <span className="hotbar-slot-name">{spell.name}</span>
                        {spell.cast && <span className="hud-slot-cast">F</span>}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Minecraft-style item hotbar — always visible at the bottom, the same
            six columns as the on-screen materials bar. Holds MATERIAL shortcuts
            (not spells); click a slot in play to select that seed for planting. */}
        <div className="inv-hotbar-label">Item hotbar — click a slot in play to select that seed</div>
        <div className="inv-hotbar-row items" style={{ gridTemplateColumns: `repeat(${hb.length}, 1fr)` }}>
          {hb.map((slot, i) => (
            <button
              key={i}
              className={`mc-slot hotbar-slot item${slot ? " filled" : ""}${heldHb?.from === i ? " held" : ""}${slot && slot.name === selectedMaterial ? " active" : ""}`}
              onClick={e => { e.stopPropagation(); clickItemSlot(i); }}
              title={slot ? slot.name : "Empty item slot — link a material from the bag"}
            >
              <span className="mc-slot-key">{i + 1}</span>
              {slot && (
                <>
                  <MaterialIcon name={slot.name} />
                  <span className="hotbar-slot-name">{slot.name}</span>
                  {slot.count > 0 ? <span className="mc-slot-count">{slot.count}</span> : <span className="mc-slot-count out">0</span>}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {heldItem && (
        <div className="mc-held" style={{ left: mouse.x, top: mouse.y }}>
          <MaterialIcon name={heldItem.name} />
          {heldItem.count > 1 && <span className="mc-slot-count">{heldItem.count}</span>}
        </div>
      )}
      {heldHbSlot && (
        <div className="mc-held" style={{ left: mouse.x, top: mouse.y }}>
          <MaterialIcon name={heldHbSlot.name} />
        </div>
      )}
      {heldSpellObj && (
        <div className="mc-held spell" style={{ left: mouse.x, top: mouse.y }}>
          <span className={`hud-slot-role ${heldSpellObj.role.toLowerCase()}`}>{roleMarks[heldSpellObj.role]}</span>
          <span className="hotbar-slot-name">{heldSpellObj.name}</span>
        </div>
      )}
    </div>
  );
}

// Crafting tab — distil role Essence from foraged materials + wand-siphoned
// energy. One card per role; each shows the material it will draw from (the
// first owned source material at ≥ matCost), the energy it will bind, and a
// live-enabled Craft button. Essence then powers that role's spell casts.
function CraftingTab({ inventory, onCraftEssence }) {
  const totalEnergy = ENERGY_TYPES.reduce((s, e) => s + (inventory[e] || 0), 0);
  return (
    <>
      <div className="craft-energy">
        <span className="hud-label">Siphoned energy</span>
        <div className="craft-energy-row">
          {ENERGY_TYPES.map(name => (
            <span key={name} className={`hud-energy-pill${inventory[name] ? " has" : ""}`} style={inventory[name] ? { borderColor: ENERGY_TINT[name], color: ENERGY_TINT[name] } : undefined}>
              {name} {inventory[name] || 0}
            </span>
          ))}
        </div>
        <span className="mc-inv-hint">Out of energy? Close this and press G near open ground, water, or a zone's element to siphon more with your Aether Wand.</span>
      </div>

      <span className="hud-label" style={{ marginTop: 10 }}>Distil essence</span>
      <div className="craft-grid">
        {ESSENCE_RECIPES.map(recipe => {
          const mat = recipe.materials.find(m => (inventory[m] || 0) >= recipe.matCost);
          const canCraft = !!mat && totalEnergy >= recipe.energyCost;
          return (
            <div key={recipe.role} className={`craft-card${canCraft ? " ready" : ""}`}>
              <div className="craft-card-head">
                <MaterialIcon name={recipe.result} />
                <b>{recipe.result}</b>
              </div>
              <span className="craft-card-cost">
                {recipe.matCost}× {mat || `${recipe.role} material`} + {recipe.energyCost}× energy
              </span>
              <button className="craft-btn" disabled={!canCraft} onClick={() => onCraftEssence(recipe.role)}>
                {mat ? "Distil" : "Need materials"}
              </button>
            </div>
          );
        })}
      </div>
      <span className="mc-inv-hint" style={{ marginTop: 6, display: "block" }}>A role Essence is spent first when you cast any spell of that role (F) — the fastest way to power active abilities.</span>
    </>
  );
}

// Millbrook Town's one real function — the game's only gold sink. Same
// overlay+backdrop pattern as Spellbook/Inventory, opened by clicking the
// "m" shop-counter tile in town (see GameEngine.js: interactAt/shopOpen).
function ShopPanel({ gold, listings, rungUnlockPrice, upgrades, shopPremiumLocked, premiumRepNeeded, reputation, onClose, onBuyMaterial, onBuyRungUnlock, onBuyUpgrade }) {
  return (
    <div className="inventory-overlay" onClick={onClose}>
      <div className="inventory-panel" onClick={e => e.stopPropagation()}>
        <div className="inventory-title">
          <h3>Millbrook Town Shop — {gold}g</h3>
          <button className="inventory-close" onClick={onClose}>Close</button>
        </div>

        <span className="hud-label">Buy materials — skip the grind to discover spells faster</span>
        <div className="inventory-grid">
          {listings.map(l => (
            <button key={l.name} className="inventory-slot shop-buy" disabled={gold < l.price} onClick={() => onBuyMaterial(l.name)}>
              <MaterialIcon name={l.name} />
              <span className="inventory-slot-name">{l.name}</span>
              <span className="inventory-slot-count">{l.price}g</span>
            </button>
          ))}
        </div>
        {shopPremiumLocked && (
          <span className="shop-locked-note">
            Rare (rung 5) stock is reserved for trusted friends of Millbrook — reach {premiumRepNeeded} reputation to unlock it (you have {reputation}). Fulfil notice-board requests and cleanse the Withering to earn it.
          </span>
        )}

        {rungUnlockPrice && (
          <>
            <span className="hud-label" style={{ marginTop: 14 }}>Unlock the next rung early</span>
            <button className="hud-advance" disabled={gold < rungUnlockPrice} onClick={onBuyRungUnlock}>
              Unlock next rung — {rungUnlockPrice}g
            </button>
          </>
        )}

        {upgrades?.length > 0 && (
          <>
            <span className="hud-label" style={{ marginTop: 14 }}>Farm upgrades — permanent improvements</span>
            <div className="shop-upgrades">
              {upgrades.map(u => {
                const maxed = u.level >= u.maxLevel;
                return (
                  <button key={u.key} className="shop-upgrade" disabled={maxed || gold < u.price} onClick={() => onBuyUpgrade(u.key)}>
                    <span className="shop-upgrade-name">{u.name} <small>Lv {u.level}/{u.maxLevel}</small></span>
                    <span className="shop-upgrade-desc">{u.desc}</span>
                    <span className="shop-upgrade-price">{maxed ? "Maxed" : `${u.price}g`}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// A one-time celebration once every one of the 40 authored spells has been
// discovered — the explicit win/completion state the game was missing.
function CompletionBanner({ onClose }) {
  return (
    <div className="inventory-overlay completion-overlay" onClick={onClose}>
      <div className="inventory-panel completion-panel" onClick={e => e.stopPropagation()}>
        <h3>★ The Grimoire is Complete ★</h3>
        <p>Every spell has been discovered — Bloom, Root, Vine, Fungus, and Pod, all 42 strong. The farm, mine, wildwood, and town have given up every secret they hold, and the Withering is held at bay.</p>
        <button className="hud-advance" onClick={onClose}>Continue playing</button>
      </div>
    </div>
  );
}

// Mastery thresholds mirror GameEngine.bumpMastery ([3,8,20] combined uses →
// Lv2/3/4). Turned into a fill fraction toward the next tier for the bar.
const MASTERY_STEPS = [0, 3, 8, 20];
function masteryProgress(level, uses) {
  if (level >= 4) return { pct: 100, label: "maxed" };
  const cur = MASTERY_STEPS[level - 1] ?? 0;
  const next = MASTERY_STEPS[level];
  const pct = Math.max(0, Math.min(100, ((uses - cur) / (next - cur)) * 100));
  return { pct, label: `${uses}/${next}` };
}

// One spellbook row. Known entries surface the full grammar plus the living-
// object layer (mastery bar, active cast cost, cooldown). Unknown entries show
// only what the player's clue level has earned — role, then material family +
// catalyst requirement numbers — turning discovery into a guided puzzle rather
// than a flat "Undiscovered".
function SpellbookEntry({ s }) {
  if (!s.known) {
    const clue = s.clueLevel || 0;
    const reqParts = s.requirement
      ? Object.entries(s.requirement).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`)
      : [];
    return (
      <div className="spellbook-entry unknown">
        <span className={`spellbook-mark ${clue >= 1 ? s.role.toLowerCase() : ""}`}>{clue >= 1 ? roleMarks[s.role] : "?"}</span>
        <b>{clue >= 1 ? `${s.role} spell (undiscovered)` : "??? — undiscovered"}</b>
        <span className="spellbook-clue">
          {clue === 0 && "No leads yet — plant, quest, or unlock rungs to reveal clues."}
          {clue >= 1 && clue < 2 && `A ${s.role} spell. Complete a quest for a sharper lead.`}
          {clue >= 2 && `Needs ${s.material}${reqParts.length ? ` · catalyst: ${reqParts.join(", ")}` : ""}${clue >= 3 ? ` via ${s.catalyst}` : ""}.`}
        </span>
      </div>
    );
  }
  const prog = masteryProgress(s.masteryLevel, s.masteryUses);
  return (
    <div className="spellbook-entry known">
      <span className={`spellbook-mark ${s.role.toLowerCase()}`}>{roleMarks[s.role]}</span>
      <b>{s.name}</b>
      <span className="spellbook-desc">{s.material} + {s.catalyst} — {s.effect}</span>
      <div className="spellbook-meta">
        <span className={`spellbook-lv lv${s.masteryLevel}`}>Lv {s.masteryLevel}</span>
        <span className="spellbook-bar"><span className="spellbook-bar-fill" style={{ width: `${prog.pct}%` }} /></span>
        <span className="spellbook-bar-label">{prog.label}</span>
        {s.cast && <span className="spellbook-cast">F: {castCostLabel(s.cast)}</span>}
        {s.cast && s.cooldownDaysLeft > 0 && <span className="spellbook-cd">recharging {s.cooldownDaysLeft}d</span>}
        {!s.cast && <span className="spellbook-cast passive">passive / role-key</span>}
      </div>
    </div>
  );
}

// A book of every authored spell, starting fully "???" — role/material/
// catalyst/name are all masked until harvestSpell() (GameEngine) reveals
// that entry, so the player discovers the grammar through play rather than
// having it all spoiled from the start.
function SpellbookPanel({ spellbook, onClose }) {
  const byRung = [1, 2, 3, 4, 5].map(rung => ({ rung, entries: spellbook.filter(s => s.rung === rung) }));
  const known = spellbook.filter(s => s.known).length;

  return (
    <div className="spellbook-overlay" onClick={onClose}>
      <div className="spellbook-panel" onClick={e => e.stopPropagation()}>
        <div className="spellbook-title">
          <h3>Spellbook ({known}/{spellbook.length} discovered)</h3>
          <button className="spellbook-close" onClick={onClose}>Close (B)</button>
        </div>
        {byRung.map(({ rung, entries }) => (
          <div key={rung} className="spellbook-rung">
            <span className="spellbook-rung-label">Rung {rung}</span>
            {entries.map(s => (
              <SpellbookEntry key={s.id} s={s} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
