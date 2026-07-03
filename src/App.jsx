import { useMemo, useState } from "react";
import { BookOpen } from "@phosphor-icons/react/BookOpen";
import { Flask } from "@phosphor-icons/react/Flask";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Moon } from "@phosphor-icons/react/Moon";
import { Plant } from "@phosphor-icons/react/Plant";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { Sun } from "@phosphor-icons/react/Sun";
import { Drop } from "@phosphor-icons/react/Drop";
import { Mountains } from "@phosphor-icons/react/Mountains";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { X } from "@phosphor-icons/react/X";
import { Check } from "@phosphor-icons/react/Check";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { Path } from "@phosphor-icons/react/Path";
import { Stack } from "@phosphor-icons/react/Stack";
import { Snowflake } from "@phosphor-icons/react/Snowflake";

const roles = ["All", "Bloom", "Root", "Vine", "Fungus", "Pod"];
const rungs = [
  { id: 1, name: "Forage", note: "Starter grammar", gate: "Available from the start" },
  { id: 2, name: "Cultivate", note: "Production setup", gate: "Build a plot, shaft, or attractor bloom" },
  { id: 3, name: "Refine", note: "Interlocking systems", gate: "Run Refine Cap + build a workbench" },
  { id: 4, name: "Craft", note: "Magical power tools", gate: "Crafting bench + refined stockpile" },
  { id: 5, name: "Discover", note: "Rare keystones", gate: "Explore deep mines and restore regions" },
];

const rawSpells = [
  [1,"Sprout Kiss","Bloom","Petals","Sunlight","Advances one crop a growth stage","Tap","Starter"],
  [1,"Rain Petal","Bloom","Petals","Water","Waters a whole crop patch","Tap","Starter"],
  [1,"Nightbud","Bloom","Petals","Moonlight","Crops raised near it sell at a premium","Tap","Value"],
  [1,"Root Tap","Root","Claybound Rootlets","Darkness","Digs soft stone; feed it dirt to continue","Feed–Tend","Mining"],
  [1,"Mudroot","Root","Clay","Water","Digs wet ground and drains a waterlogged tile","Feed–Tend","Mining"],
  [1,"Creek Vine","Vine","Reed","Water","Floats goods along a water tile","Drag","Logistics"],
  [1,"Reed Haul","Vine","Reed","Sunlight","Carries items a short distance by day","Drag","Logistics"],
  [1,"Rotcap","Fungus","Wild Spores","Water","Turns dead crops and waste into fresh Compost","Feed–Tend","Gateway"],
  [1,"Sweetberry","Pod","Wild Seed","Sunlight","First sellable foraged fruit, low value","Tap","Grower"],
  [1,"Duskberry","Pod","Wild Seed","Moonlight","Night berries with a small premium","Tap","Grower"],
  [2,"Sunblossom","Bloom","Compost","Sunlight","Aura: nearby crops grow faster","Tap / Place","Grower"],
  [2,"Dewbind","Bloom","Compost","Water","Auto-waters its patch daily, unattended","Tap / Place","Grower"],
  [2,"Beebalm","Bloom","Grain","Sunlight","Attracts bees, yielding Honey and Beeswax","Tap / Place","Ranching"],
  [2,"Grazeflower","Bloom","Grain","Water","Attracts grazers, yielding Manure and Wool","Tap / Place","Ranching"],
  [2,"Ore Whisper","Root","Copper Ore","Moonlight","Reveals nearby ore veins","Tap","Mining"],
  [2,"Deep Root","Root","Stone","Darkness","Digs hard stone","Feed–Tend","Mining"],
  [2,"Vine Haul","Vine","Fiber","Sunlight","Auto-carries mined ore to storage","Drag","Logistics"],
  [2,"Deepvine","Vine","Fiber","Darkness","Hauls ore up out of the cave","Drag","Logistics"],
  [2,"Refine Cap","Fungus","Copper Ore","Darkness","Turns raw ore into a sellable ingot","Feed–Tend","Gateway"],
  [2,"Croppod","Pod","Farm Seed","Sunlight","Reliable staple crop, better than foraged fruit","Tap","Grower"],
  [2,"Duskpod","Pod","Farm Seed","Moonlight","Premium farmed night fruit","Tap","Grower"],
  [3,"Hardy Bloom","Bloom","Wax","Sunlight","Crops ignore off-season and weather penalties","Tap / Place","Grower"],
  [3,"Deepbore","Root","Iron Ingot","Darkness","Digs the deepest hard stone","Feed–Tend","Mining"],
  [3,"Prospect Root","Root","Iron Ingot","Moonlight","Reveals a wide radius, including deeper veins","Tap","Mining"],
  [3,"Loomcap","Fungus","Cloth","Darkness","Weaves Fiber into Cloth and Rope","Feed–Tend","Refining"],
  [3,"Iron Cap","Fungus","Iron Ore","Darkness","Refines hard ore into high-grade ingots","Feed–Tend","Refining"],
  [3,"Market Vine","Vine","Rope","Sunlight","Delivers goods to the stall and sells them","Drag","Logistics"],
  [3,"Coldvine","Vine","Cloth","Darkness","Moves perishable goods without spoiling","Drag","Logistics"],
  [3,"Honeypod","Pod","Honey","Sunlight","Sweet premium fruit","Tap","Grower"],
  [3,"Everpod","Pod","Iron Ingot frame","Sunlight","Hardy perennial; produces across seasons","Tap, recurring","Grower"],
  [4,"Gold Bloom","Bloom","Essence","Sunlight","Charge with sunlight to force a rare mutation","Hold–Charge","Power"],
  [4,"Quakeroot","Root","Alloy","Darkness","Charge and release for a large-radius instant dig","Hold–Charge","Power"],
  [4,"Trade Vine","Vine","Alloy","Sunlight","Map-wide auto-delivery between any two points","Drag","Logistics"],
  [4,"Ember Cap","Fungus","Alloy","Moonlight","Turns premium metal into fine tools and artifacts","Timed","Refining"],
  [4,"Confectipod","Pod","Confection","Sunlight","Luxury confection fruit, high value","Tap","Grower"],
  [5,"Moonpetal","Bloom","Everbloom Pollen","Moonlight","Guarantees top-quality crops; peaks on a full moon","Timed","Keystone"],
  [5,"Crystal Sense","Root","Crystal Shard","Moonlight","Reveals rare gem deposits","Tap","Keystone"],
  [5,"Skyvine","Vine","Skyvine Silk","Moonlight","Teleport-delivers one high-value item per full moon","Drag","Keystone"],
  [5,"Moon Refine","Fungus","Moonspore","Moonlight","Turns gems into jewelry, the highest-value refined good","Timed","Keystone"],
  [5,"Prizepod","Pod","Everbloom Seed","Sunlight","Rarest fruit; peak harvest pays, late harvest spoils","Timed","Keystone"],
];
const spells = rawSpells.map((s, id) => ({ id, rung:s[0], name:s[1], role:s[2], material:s[3], catalyst:s[4], effect:s[5], interaction:s[6], tag:s[7] }));
const materialsByRung = {
  1:["Petals","Clay","Claybound Rootlets","Reed","Wild Spores","Wild Seed"],
  2:["Compost","Grain","Copper Ore","Stone","Fiber","Farm Seed"],
  3:["Wax","Iron Ingot","Cloth","Iron Ore","Rope","Honey","Iron Ingot frame"],
  4:["Essence","Alloy","Confection"],
  5:["Everbloom Pollen","Crystal Shard","Skyvine Silk","Moonspore","Everbloom Seed"],
};
const catalystIcons = { Sunlight:Sun, Water:Drop, Snowfall:Snowflake, Darkness:Mountains, Moonlight:Moon };
const catalystCosts = { 1:1, 2:2, 3:3, 4:5, 5:8 };
const seasonalConditions = {
  Spring:{ Sunlight:3, Water:4, Snowfall:0, Darkness:2, Moonlight:2 },
  Summer:{ Sunlight:6, Water:1, Snowfall:0, Darkness:1, Moonlight:2 },
  Autumn:{ Sunlight:3, Water:2, Snowfall:0, Darkness:3, Moonlight:3 },
  Winter:{ Sunlight:1, Water:1, Snowfall:6, Darkness:5, Moonlight:4 },
};
const conditionNames = ["Sunlight","Water","Snowfall","Darkness","Moonlight"];
function spellRequirements(spell) {
  const needs = { Sunlight:0, Water:0, Snowfall:0, Darkness:0, Moonlight:0 };
  const upkeep = Math.max(1, Math.ceil(spell.rung / 2));
  if (spell.role === "Bloom") { needs.Sunlight = upkeep; needs.Water = upkeep; }
  if (spell.role === "Root") needs.Darkness = upkeep;
  if (spell.role === "Vine") { needs.Sunlight = upkeep; needs.Water = 1; }
  if (spell.role === "Fungus") { needs.Darkness = upkeep; needs.Water = 1; }
  if (spell.role === "Pod") { needs.Sunlight = upkeep; needs.Water = upkeep; }
  needs[spell.catalyst] = Math.max(needs[spell.catalyst], catalystCosts[spell.rung]);
  return needs;
}
const roleMarks = { Bloom:"BL", Root:"RT", Vine:"VN", Fungus:"FG", Pod:"PD" };
const essenceSources = {
  Bloom: { name:"Bloom Essence", sources:[
    {material:"Petals",rung:1,yield:1},{material:"Grain",rung:2,yield:2},{material:"Everbloom Pollen",rung:5,yield:8},
  ]},
  Root: { name:"Root Essence", sources:[
    {material:"Claybound Rootlets",rung:1,yield:1},{material:"Stone",rung:2,yield:2},{material:"Iron Ingot",rung:3,yield:3},{material:"Crystal Shard",rung:5,yield:8},
  ]},
  Vine: { name:"Vine Essence", sources:[
    {material:"Reed",rung:1,yield:1},{material:"Fiber",rung:2,yield:2},{material:"Rope",rung:3,yield:3},{material:"Skyvine Silk",rung:5,yield:8},
  ]},
  Fungus: { name:"Fungus Essence", sources:[
    {material:"Wild Spores",rung:1,yield:1},{material:"Compost",rung:2,yield:2},{material:"Moonspore",rung:5,yield:8},
  ]},
  Pod: { name:"Pod Essence", sources:[
    {material:"Wild Seed",rung:1,yield:1},{material:"Farm Seed",rung:2,yield:2},{material:"Confection",rung:4,yield:5},{material:"Everbloom Seed",rung:5,yield:8},
  ]},
};
const activityByRung = {
  1:"Foraged from the environment",
  2:"Cultivated, mined, or attracted",
  3:"Processed from raw materials",
  4:"Crafted from refined stock",
  5:"Discovered in rare regions",
};
const materialCatalog = [
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
const fizzle = {
  "Bloom|Darkness":"Flowers will not take in the dark.",
  "Pod|Darkness":"Fruit will not ripen without light.",
  "Root|Sunlight":"Roots want darkness, not open sun.",
  "Fungus|Sunlight":"Fungi wither in direct sun.",
};

export function App() {
  const [view, setView] = useState("spellbook");
  const [selected, setSelected] = useState(spells[7]);
  const [rung, setRung] = useState(0);
  const [role, setRole] = useState("All");
  const [query, setQuery] = useState("");
  const [recipe, setRecipe] = useState({ role:"Fungus", material:"Wild Spores", catalyst:"Water" });
  const [tested, setTested] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const [materialQuery, setMaterialQuery] = useState("");
  const [materialRung, setMaterialRung] = useState(0);
  const [season, setSeason] = useState("Spring");
  const [nearStream, setNearStream] = useState(false);
  const [conditionLevels, setConditionLevels] = useState({...seasonalConditions.Spring});

  const filtered = useMemo(() => spells.filter(s =>
    (!rung || s.rung === rung) && (role === "All" || s.role === role) &&
    (s.name + s.effect + s.material).toLowerCase().includes(query.toLowerCase())
  ), [rung, role, query]);

  const result = spells.find(s => s.role === recipe.role && s.material === recipe.material && s.catalyst === recipe.catalyst);
  const fizzleReason = fizzle[`${recipe.role}|${recipe.catalyst}`];
  const conditions = { ...conditionLevels, Water:nearStream ? Infinity : conditionLevels.Water };
  const requirements = result ? spellRequirements(result) : Object.fromEntries(conditionNames.map(name=>[name,0]));
  const deficits = conditionNames.filter(name => conditions[name] < requirements[name]);
  const outcome = result && deficits.length
    ? { type:"dormant", spell:result, reason:deficits.map(name=>`${name}: needs ${requirements[name]}, has ${conditions[name]}`).join(" · ") }
    : result ? { type:"success", spell:result } :
    fizzleReason ? { type:"fizzle", reason:fizzleReason } :
    { type:"unknown", reason:"No authored spell uses this combination yet. That may be a useful design gap." };

  function chooseRecipe(key, value) {
    setRecipe(r => ({ ...r, [key]:value }));
    setTested(false);
  }

  return (
    <main className="app-shell">
      <header>
        <button className="brand" onClick={() => setView("spellbook")} aria-label="Plant Magic home">
          <span className="brand-mark"><Plant weight="fill" /></span>
          <span><b>Plant Magic</b><small>spell system explorer</small></span>
        </button>
        <nav aria-label="Primary">
          <button className={view==="spellbook"?"active":""} onClick={()=>setView("spellbook")}><BookOpen /> Spellbook</button>
          <button className={view==="garden"?"active":""} onClick={()=>setView("garden")}><Flask /> Recipe Garden</button>
          <button className={view==="materials"?"active":""} onClick={()=>setView("materials")}><Stack /> Materials</button>
        </nav>
        <button className="journey-button" onClick={()=>setShowJourney(true)}><Path /> View sourcing ladder</button>
      </header>

      {view === "spellbook" ? (
        <section className="workspace">
          <aside className="rail">
            <div className="eyebrow">Progression rung</div>
            <button className={!rung?"rung active":"rung"} onClick={()=>setRung(0)}><span>✦</span><b>All spells</b><small>40 total</small></button>
            {rungs.map(r => <button key={r.id} className={rung===r.id?"rung active":"rung"} onClick={()=>setRung(r.id)}>
              <span>{r.id}</span><b>{r.name}</b><small>{spells.filter(s=>s.rung===r.id).length} spells</small>
            </button>)}
            <div className="grammar-note"><Sparkle weight="fill" /><b>The spell grammar</b><p>Plant a role essence for the job. Add sourced material for power. The planting condition creates the catalyst.</p></div>
          </aside>

          <section className="index-panel">
            <div className="panel-title"><div><span className="eyebrow">Living collection</span><h1>{rung ? `${rungs[rung-1].name} spells` : "All spells"}</h1></div><span className="count">{filtered.length}</span></div>
            <label className="search"><MagnifyingGlass /><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search spells, effects, materials…" /></label>
            <div className="role-filters">{roles.map(x=><button key={x} className={role===x?"active":""} onClick={()=>setRole(x)}>{x}</button>)}</div>
            <div className="spell-list">
              {filtered.map(s => {
                const Icon = catalystIcons[s.catalyst];
                return <button key={s.id} className={selected.id===s.id?"spell-row selected":"spell-row"} onClick={()=>setSelected(s)}>
                  <span className={`role-mark ${s.role.toLowerCase()}`}>{roleMarks[s.role]}</span>
                  <span className="spell-copy"><b>{s.name}</b><small>{s.material}</small></span>
                  <span className="spell-meta"><span>R{s.rung}</span><Icon /></span>
                </button>;
              })}
              {!filtered.length && <div className="empty"><Plant /><b>No spells found</b><span>Try opening another rung or role.</span></div>}
            </div>
          </section>

          <article className="detail-panel">
            <div className="detail-top">
              <span className={`plant-emblem ${selected.role.toLowerCase()}`}>
                {selected.name === "Rotcap"
                  ? <img src="/assets/rotcap-specimen.png" alt="Pixel-art Rotcap specimen" />
                  : <Plant weight="duotone" />}
              </span>
              <div><span className="eyebrow">Rung {selected.rung} · {rungs[selected.rung-1].name}</span><h2>{selected.name}</h2><p>{selected.effect}</p></div>
            </div>
            <div className="formula" aria-label="Spell formula">
              <Ingredient label="Role essence" value={essenceSources[selected.role].name} />
              <ArrowRight />
              <Ingredient label="Material" value={selected.material} />
              <ArrowRight />
              <Ingredient label="Primary catalyst" value={`${selected.catalyst} · minimum ${catalystCosts[selected.rung]}`} />
            </div>
            <div className="fact-grid">
              <div><span>Essence sources & yields</span><b>{essenceSources[selected.role].sources.map(s=>`${s.material} (+${s.yield})`).join(", ")}</b></div>
              <div><span>Interaction</span><b>{selected.interaction}</b></div>
              <div><span>Design function</span><b>{selected.tag}</b></div>
              <div><span>Economy path</span><b>{selected.role==="Root"?"Digger":selected.role==="Vine"||selected.role==="Fungus"?"Trader":"Grower"}</b></div>
              <div><span>Unlock gate</span><b>{rungs[selected.rung-1].gate}</b></div>
              <div className="full-demand"><span>Minimum environmental requirements</span><b>{conditionNames.map(name=>`${name} ${spellRequirements(selected)[name]}`).join(" · ")}</b></div>
            </div>
            {(selected.name==="Rotcap" || selected.name==="Refine Cap") && <div className="insight"><Sparkle weight="fill" /><div><b>{selected.name==="Rotcap"?"Hinge spell":"Gateway spell"}</b><p>{selected.name==="Rotcap"?"Rotcap turns failure into Compost, opening the cultivation loop.":"Refine Cap opens the upper half of the spellbook by turning mining into refined stock."}</p></div></div>}
            <div className="source-box"><div><span className="eyebrow">Material neighborhood</span><h3>Other {rungs[selected.rung-1].name} materials</h3></div><div className="material-tags">{materialsByRung[selected.rung].map(m=><span key={m} className={m===selected.material?"current":""}>{m}</span>)}</div></div>
            <button className="primary" onClick={()=>{setRecipe({role:selected.role,material:selected.material,catalyst:selected.catalyst});setTested(false);setView("garden")}}>Try this recipe <ArrowRight /></button>
          </article>
        </section>
      ) : view === "garden" ? (
        <section className="garden">
          <div className="garden-heading"><span className="eyebrow">Experiment safely</span><h1>Recipe Garden</h1><p>Plant a physical role essence, feed it a sourced material, then let the environment shape its catalyst.</p></div>
          <section className="essence-extractor">
            <div className="extractor-copy"><span className="eyebrow">Before planting</span><h2>Extract a role essence</h2><p>Compatible materials carry plant identities. Rarer sources release more essence per extraction.</p></div>
            <div className="essence-row">
              {Object.entries(essenceSources).map(([key,item]) =>
                <button key={key} className={recipe.role===key?"active":""} onClick={()=>chooseRecipe("role",key)}>
                  <span className={`role-mark ${key.toLowerCase()}`}>{roleMarks[key]}</span>
                  <span><b>{item.name}</b><small>{item.sources.length} sources · {item.sources[0].yield}–{item.sources[item.sources.length-1].yield} yield</small></span>
                </button>)}
            </div>
            <div className="yield-ladder">
              <span className="eyebrow">{essenceSources[recipe.role].name} extraction yields</span>
              <div>{essenceSources[recipe.role].sources.map(source=><span key={source.material}><b>{source.material}</b><small>R{source.rung}</small><strong>+{source.yield}</strong></span>)}</div>
            </div>
          </section>
          <div className="composer">
            <Picker label="1 · Role essence" value={recipe.role} values={roles.slice(1)} onChange={v=>chooseRecipe("role",v)} format={v=>`${v} Essence`} />
            <span className="plus">+</span>
            <Picker label="2 · Material" value={recipe.material} values={Object.values(materialsByRung).flat()} onChange={v=>chooseRecipe("material",v)} />
            <span className="plus">+</span>
            <Picker label="3 · Catalyst" value={recipe.catalyst} values={["Sunlight","Water","Snowfall","Darkness","Moonlight"]} onChange={v=>chooseRecipe("catalyst",v)} />
          </div>
          <section className="season-panel">
            <div className="season-controls">
              <div><span className="eyebrow">Seasonal conditions</span><h2>{season} plot</h2></div>
              <div className="season-buttons">{Object.keys(seasonalConditions).map(name=><button key={name} className={season===name?"active":""} onClick={()=>{setSeason(name);setConditionLevels({...seasonalConditions[name]});setTested(false)}}>{name}</button>)}</div>
              <button className={nearStream?"stream-toggle active":"stream-toggle"} onClick={()=>{setNearStream(v=>!v);setTested(false)}}><Drop weight="fill" /> {nearStream?"Stream plot: infinite Water":"Move plot next to stream"}</button>
            </div>
            <div className="condition-grid">
              {conditionNames.map(name=>{
                const Icon=catalystIcons[name];
                const amount=conditions[name];
                const needed=requirements[name];
                return <label key={name} className={needed>0?"condition active":"condition"}><Icon /><span>{name}</span>{amount===Infinity?<b>∞</b>:<input aria-label={`${name} available`} type="number" min="0" max="20" value={amount} onChange={event=>{setConditionLevels(levels=>({...levels,[name]:Math.max(0,Number(event.target.value))}));setTested(false)}}/>}<small>minimum {needed}</small></label>
              })}
            </div>
          </section>
          <button className="plant-button" onClick={()=>setTested(true)}><Plant weight="fill" /> Plant spell</button>
          <div className={`result ${tested ? "revealed" : ""} ${tested ? outcome.type : ""}`}>
            {!tested ? <><Sparkle /><b>The soil is listening</b><p>Plant your combination to see what grows.</p></> :
            outcome.type==="success" ? <><span className="result-icon"><Check /></span><span className="eyebrow">A spell takes root</span><h2>{outcome.spell.name}</h2><p>{outcome.spell.effect}</p><small>All five environmental minimums are met{nearStream&&requirements.Water>0?"; stream Water is infinite":""}.</small><button onClick={()=>{setSelected(outcome.spell);setView("spellbook")}}>Open spell dossier <ArrowRight /></button></> :
            outcome.type==="dormant" ? <><span className="result-icon"><Snowflake /></span><span className="eyebrow">Not enough seasonal energy</span><h2>The spell stays dormant</h2><p>{outcome.reason}</p><small>Change the season, move the plot, or plant a lower-rung spell.</small></> :
            outcome.type==="fizzle" ? <><span className="result-icon"><X /></span><span className="eyebrow">Natural logic fizzle</span><h2>It won’t take root</h2><p>{outcome.reason}</p><small>Most materials are returned. Try a different planting condition.</small></> :
            <><span className="result-icon"><MagnifyingGlass /></span><span className="eyebrow">Uncharted combination</span><h2>A design gap?</h2><p>{outcome.reason}</p><small>Consider whether this should become a spell, intentionally remain empty, or fizzle.</small></>}
          </div>
          <div className="fizzle-strip"><b>Known fizzle rules</b>{Object.entries(fizzle).map(([key,reason])=><button key={key} onClick={()=>{const [r,c]=key.split("|");chooseRecipe("role",r);chooseRecipe("catalyst",c)}}><span>{key.replace("|"," Essence + ")}</span><small>{reason}</small></button>)}</div>
        </section>
      ) : (
        <MaterialsPage
          query={materialQuery}
          setQuery={setMaterialQuery}
          rung={materialRung}
          setRung={setMaterialRung}
          openSpell={(spell)=>{setSelected(spell);setView("spellbook")}}
        />
      )}

      {showJourney && <div className="modal-backdrop" onMouseDown={()=>setShowJourney(false)}><section className="journey-modal" onMouseDown={e=>e.stopPropagation()}>
        <button className="close" onClick={()=>setShowJourney(false)} aria-label="Close"><X /></button>
        <span className="eyebrow">Material progression</span><h2>The sourcing ladder</h2><p>Power comes from what the player learns to produce—not from an abstract level number.</p>
        <div className="ladder">{rungs.map((r,i)=><div className="ladder-step" key={r.id}><span>{r.id}</span><div><b>{r.name}</b><small>{r.note}</small><p>{r.gate}</p></div>{i<4&&<ArrowRight />}</div>)}</div>
        <div className="ladder-insight"><LockKey /><p><b>The mid-game knot:</b> Rung 3 makes farming, ranching, mining, and logistics depend on one another.</p></div>
      </section></div>}
    </main>
  );
}

function Ingredient({label,value}) { return <div className="ingredient"><span>{label}</span><b>{value}</b></div> }
function Picker({label,value,values,onChange,format=(v)=>v}) { return <label className="picker"><span>{label}</span><div><select value={value} onChange={e=>onChange(e.target.value)}>{values.map(v=><option key={v} value={v}>{format(v)}</option>)}</select><CaretDown /></div></label> }

function MaterialsPage({query,setQuery,rung,setRung,openSpell}) {
  const filtered = materialCatalog.filter(item =>
    (!rung || item.rung===rung) &&
    `${item.name} ${item.kind} ${item.origin} ${item.note} ${item.spells.map(s=>s.name).join(" ")}`.toLowerCase().includes(query.toLowerCase())
  );
  return <section className="materials-page">
    <div className="materials-hero">
      <div><span className="eyebrow">Physical inventory</span><h1>Material Almanac</h1><p>Every essence, forageable, cultivated good, refined input, crafted stock, and rare discovery currently used by the spell system.</p></div>
      <div className="material-stats">
        <div><b>{materialCatalog.length}</b><span>physical inputs</span></div>
        <div><b>5</b><span>role essences</span></div>
        <div><b>{new Set(spells.map(s=>s.material)).size}</b><span>spell materials</span></div>
      </div>
    </div>
    <div className="materials-tools">
      <label className="search"><MagnifyingGlass /><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search materials or enabled spells…" /></label>
      <div className="material-rungs">
        <button className={!rung?"active":""} onClick={()=>setRung(0)}>All rungs</button>
        {rungs.map(r=><button key={r.id} className={rung===r.id?"active":""} onClick={()=>setRung(r.id)}>{r.id} · {r.name}</button>)}
      </div>
    </div>
    <div className="materials-table" role="table" aria-label="All materials">
      <div className="materials-head" role="row"><span>Material</span><span>Type & source</span><span>Used by</span><span>Rung</span></div>
      {filtered.map(item=><article className="material-row" role="row" key={item.id}>
        <div className="material-name"><span className={item.kind==="Role essence"?"material-swatch essence":"material-swatch"}><Stack weight="fill" /></span><div><b>{item.name}</b>{item.note&&<small>{item.note}</small>}</div></div>
        <div className="material-origin"><b>{item.kind}</b><small>{item.origin}</small></div>
        <div className="material-uses">
          {item.spells.length ? <>
            <span>{item.spells.length} {item.spells.length===1?"spell":"spells"}</span>
            <div>{item.spells.slice(0,3).map(s=><button key={s.id} onClick={()=>openSpell(s)}>{s.name}</button>)}{item.spells.length>3&&<small>+{item.spells.length-3} more</small>}</div>
          </> : <span className="extract-only">Extraction only</span>}
        </div>
        <span className="material-rung-badge">{item.rung}<small>{rungs[item.rung-1].name}</small></span>
      </article>)}
      {!filtered.length&&<div className="materials-empty"><MagnifyingGlass /><b>No matching materials</b><span>Try another rung or search term.</span></div>}
    </div>
    <div className="material-warning"><Sparkle weight="fill" /><p><b>Naming collision:</b> “Essence” is currently both the family name for role essences and a Rung 4 crafted material used by Gold Bloom. This is worth renaming during the next system pass.</p></div>
  </section>
}
