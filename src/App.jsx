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
import { GameController } from "@phosphor-icons/react/GameController";
import { Game } from "./game/Game.jsx";
import {
  roles, rungs, spells, materialsByRung, catalystCosts, seasonalConditions,
  conditionNames, spellRequirements, roleMarks, essenceSources, activityByRung,
  materialCatalog, fizzle,
} from "./data/spellSystem.js";

const catalystIcons = { Sunlight:Sun, Water:Drop, Snowfall:Snowflake, Darkness:Mountains, Moonlight:Moon };

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
          <button className={view==="play"?"active":""} onClick={()=>setView("play")}><GameController /> Play Beta</button>
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
      ) : view === "materials" ? (
        <MaterialsPage
          query={materialQuery}
          setQuery={setMaterialQuery}
          rung={materialRung}
          setRung={setMaterialRung}
          openSpell={(spell)=>{setSelected(spell);setView("spellbook")}}
        />
      ) : (
        <Game />
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
  </section>
}
