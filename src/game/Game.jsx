import { useEffect, useRef, useState } from "react";
import { GameEngine } from "./GameEngine.js";
import { draw } from "./render.js";
import { TILE } from "./maps.js";
import { VIEW_W, VIEW_H, cameraOffset } from "./camera.js";
import { Hud } from "./Hud.jsx";

const MOVE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
};

export function Game() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const heldRef = useRef(new Set());
  const showSpellbookRef = useRef(false);
  const showInventoryRef = useRef(false);
  const showWandRef = useRef(false);
  const [snapshot, setSnapshot] = useState(null);
  const [showSpellbook, setShowSpellbook] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  // Tab reveals the Wand's equipped spells as a temporary overlay so the active
  // spell can be seen/switched — spells never sit in the always-on hotbar.
  const [showWand, setShowWand] = useState(false);

  if (!engineRef.current) engineRef.current = new GameEngine();
  const engine = engineRef.current;

  // Shared by the keyboard (KeyI/KeyB) and the new mouse-clickable HUD
  // buttons, so both input paths follow the exact same "one overlay at a
  // time, blocked during the ritual" rule.
  function toggleInventory() {
    if (showSpellbookRef.current) return;
    showInventoryRef.current = !showInventoryRef.current;
    setShowInventory(showInventoryRef.current);
  }
  function toggleSpellbook() {
    showSpellbookRef.current = !showSpellbookRef.current;
    setShowSpellbook(showSpellbookRef.current);
  }

  // Converts a canvas mouse event's page coordinates into tile coordinates,
  // accounting for the canvas's CSS display size differing from its internal
  // pixel resolution (play-canvas is styled to width:min(80vw,900px)).
  function tileFromEvent(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    // Screen -> canvas pixels, then add the live camera offset before dividing
    // into tiles, so clicks land on the correct world tile at any scroll
    // position (the world is drawn translated by -offset; undo that here).
    const px = (e.clientX - rect.left) * scaleX, py = (e.clientY - rect.top) * scaleY;
    const { ox, oy } = cameraOffset(engine);
    return { tx: Math.floor((px + ox) / TILE), ty: Math.floor((py + oy) / TILE) };
  }

  // Mouse is the primary interaction model, but movement and "use" are no
  // longer split across left/right click — clicking never walks the player
  // anywhere. Click a hotbar slot to equip a spell, or click a materials-bar
  // chip to select a seed material, then click a tile next to you in the
  // world to use whatever's equipped/selected on it — e.g. click tilled soil
  // to plant a selected seed, click a pending plot with a Fungus spell
  // equipped to spray its essence, or click sunlight/water/darkness/
  // moonlight with a Vine spell equipped to draw in energy and then
  // release it on the plot. No menu ever opens for any of this. Movement is
  // keyboard-only (WASD/Arrows). Blocked while a full-screen overlay
  // (Spellbook/Inventory/Shop) is open. Right-click is disabled (just
  // suppresses the browser's context menu) so there's a single, unambiguous
  // click action.
  function onCanvasClick(e) {
    // engine.shopOpen isn't mirrored into React state/refs the way the
    // Spellbook/Inventory overlays are (it's toggled by clicking a world
    // tile, not a keyboard shortcut), but it's a plain property on the
    // stable engine instance so reading it live here is safe and current.
    if (showSpellbookRef.current || showInventoryRef.current || engine.shopOpen || engine.questBoardOpen || engine.mapOpen || engine.potOpen) return;
    const { tx, ty } = tileFromEvent(e);
    engine.handleTileAction(tx, ty);
  }
  function onCanvasContextMenu(e) {
    e.preventDefault();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf, last = performance.now();

    function recalcMove() {
      let dx = 0, dy = 0;
      for (const code of heldRef.current) { const v = MOVE_KEYS[code]; if (v) { dx += v[0]; dy += v[1]; } }
      engine.setMoveInput(Math.sign(dx), Math.sign(dy));
    }

    function onKeyDown(e) {
      // Minecraft-style inventory (I): mutually exclusive with the
      // spellbook (B) and blocked during the planting ritual — same
      // "one overlay at a time" rule as the spellbook already follows.
      if (e.code === "KeyI") {
        if (showSpellbookRef.current) return;
        toggleInventory();
        e.preventDefault();
        return;
      }
      if (showInventoryRef.current) {
        if (e.code === "Escape") { showInventoryRef.current = false; setShowInventory(false); }
        return;
      }
      // The Town shop overlay is driven entirely by engine.shopOpen (toggled
      // by clicking the world's "m" tile), not a React-tracked ref, but it
      // still deserves the same Escape-to-close convenience as the other
      // two overlays.
      if (engine.shopOpen) {
        if (e.code === "Escape") engine.closeShop();
        return;
      }
      // The town notice board (quest board) overlay is likewise engine-driven
      // (toggled by clicking the world "q" tile), so it gets the same
      // Escape-to-close and input-blocking treatment as the shop.
      if (engine.questBoardOpen) {
        if (e.code === "Escape") engine.closeQuestBoard();
        return;
      }
      // The full-world map (M) is likewise engine-driven, so it gets the same
      // Escape-to-close + input-blocking treatment as the shop/board overlays.
      if (engine.mapOpen) {
        if (e.code === "Escape" || e.code === "KeyM") engine.closeMap();
        return;
      }
      // The Pot combine panel (a held item's GUI) is engine-driven like the shop,
      // opened with C; it blocks world input and closes on Escape/C.
      if (engine.potOpen) {
        if (e.code === "Escape" || e.code === "KeyC") { engine.closePot(); setSnapshot(engine.getSnapshot()); }
        return;
      }
      if (e.code === "KeyC") {
        engine.togglePot(); setSnapshot(engine.getSnapshot());
        e.preventDefault();
        return;
      }
      if (e.code === "KeyB") {
        toggleSpellbook();
        e.preventDefault();
        return;
      }
      if (showSpellbookRef.current) {
        if (e.code === "Escape") { showSpellbookRef.current = false; setShowSpellbook(false); }
        return;
      }
      // Tab reveals/hides the Wand's equipped-spell bar (a temporary overlay).
      if (e.code === "Tab") {
        showWandRef.current = !showWandRef.current; setShowWand(showWandRef.current);
        e.preventDefault(); return;
      }
      if (showWandRef.current && e.code === "Escape") {
        showWandRef.current = false; setShowWand(false); e.preventDefault(); return;
      }
      if (MOVE_KEYS[e.code]) {
        heldRef.current.add(e.code); recalcMove(); e.preventDefault(); return;
      }
      if (e.code === "KeyE") engine.interact();
      else if (e.code === "KeyT") engine.till();
      else if (e.code === "KeyP") engine.plant();
      else if (e.code === "KeyF") engine.castSpell();
      else if (e.code === "KeyN") engine.advanceDay();
      else if (e.code === "KeyG") { engine.siphonEnergy(); setSnapshot(engine.getSnapshot()); }
      else if (e.code === "KeyM") engine.toggleMap();
      else if (e.code.startsWith("Digit")) {
        // Selecting a wand spell by number auto-reveals the wand bar so the
        // switch is visible even when the bar was hidden.
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 9) { engine.selectWand(n - 1); showWandRef.current = true; setShowWand(true); }
      }
      else return;
      e.preventDefault();
    }
    function onKeyUp(e) {
      if (MOVE_KEYS[e.code]) { heldRef.current.delete(e.code); recalcMove(); }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      engine.update(dt);
      // Canvas is a fixed viewport now (see camera.js) rather than sized to the
      // whole zone — the renderer scrolls the world to follow the player, which
      // is what lets zones grow larger than one screen.
      if (canvas.width !== VIEW_W) canvas.width = VIEW_W;
      if (canvas.height !== VIEW_H) canvas.height = VIEW_H;
      draw(ctx, engine, VIEW_W, VIEW_H);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const hudInterval = setInterval(() => setSnapshot(engine.getSnapshot()), 120);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudInterval);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [engine]);

  return (
    <section className="play-screen">
      <div className="play-frame">
        <canvas
          ref={canvasRef}
          className="play-canvas"
          onClick={onCanvasClick}
          onContextMenu={onCanvasContextMenu}
        />
        {snapshot && (
          <Hud
            snapshot={snapshot}
            showWand={showWand}
            onSelectWand={(i) => engine.selectWand(i)}
            onSelectMaterialSlot={(name) => engine.selectMaterial(name)}
            onAdvanceDay={() => engine.advanceDay()}
            onSelectMaterial={(name) => engine.selectMaterial(name)}
            showSpellbook={showSpellbook}
            onOpenSpellbook={toggleSpellbook}
            onCloseSpellbook={() => { showSpellbookRef.current = false; setShowSpellbook(false); }}
            showInventory={showInventory}
            onOpenInventory={toggleInventory}
            onCloseInventory={() => { showInventoryRef.current = false; setShowInventory(false); }}
            onCloseShop={() => engine.closeShop()}
            onOpenPot={() => { engine.openPot(); setSnapshot(engine.getSnapshot()); }}
            onClosePot={() => { engine.closePot(); setSnapshot(engine.getSnapshot()); }}
            onCombinePot={(material, catalyst) => { engine.combineInPot(material, catalyst); setSnapshot(engine.getSnapshot()); }}
            onExtractEssence={(crop) => { engine.extractEssence(crop); setSnapshot(engine.getSnapshot()); }}
            onCloseMap={() => engine.closeMap()}
            onOpenMap={() => engine.toggleMap()}
            onCloseQuestBoard={() => engine.closeQuestBoard()}
            onClaimQuest={(id) => engine.claimQuest(id)}
            onBuyMaterial={(name) => engine.buyMaterial(name)}
            onBuyRungUnlock={() => engine.buyRungUnlock()}
            onBuyUpgrade={(key) => engine.buyUpgrade(key)}
            onDiscard={(name) => engine.discardItem(name)}
            onMoveSlot={(from, to) => { engine.moveInvSlot(from, to); setSnapshot(engine.getSnapshot()); }}
            onTrashSlot={(i) => { engine.trashInvSlot(i); setSnapshot(engine.getSnapshot()); }}
            onSiphon={() => { engine.siphonEnergy(); setSnapshot(engine.getSnapshot()); }}
            onSelectEnergy={(name) => { engine.selectEnergy(name); setSnapshot(engine.getSnapshot()); }}
            onCraftEssence={(role) => { engine.craftEssence(role); setSnapshot(engine.getSnapshot()); }}
            onEquipWand={(slot, spellId) => { engine.equipWand(slot, spellId); setSnapshot(engine.getSnapshot()); }}
            onMoveWand={(from, to) => { engine.moveWandSlot(from, to); setSnapshot(engine.getSnapshot()); }}
            onUnequipWand={(slot) => { engine.unequipWand(slot); setSnapshot(engine.getSnapshot()); }}
            onAssignItemHotbar={(slot, name) => { engine.assignItemHotbar(slot, name); setSnapshot(engine.getSnapshot()); }}
            onMoveItemHotbar={(from, to) => { engine.moveItemHotbarSlot(from, to); setSnapshot(engine.getSnapshot()); }}
            onClearItemHotbar={(slot) => { engine.clearItemHotbarSlot(slot); setSnapshot(engine.getSnapshot()); }}
            onEquipArtifact={(name) => engine.equipArtifact(name)}
            onUnequipArtifact={() => engine.unequipArtifact()}
          />
        )}
      </div>
    </section>
  );
}
