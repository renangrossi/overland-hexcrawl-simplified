// Overland Hexcrawl — a travel game driven by the Overland Hexcrawl Simplified tables
// and the Thematic Foe Tables & Wildland bestiary.
(async function(){
let TB, BE;
try { TB = await (await fetch('tables.json')).json(); BE = await (await fetch('bestiary.json')).json(); }
catch(e){ document.querySelector('#log').innerHTML = '<p class="bad"><b>Could not load the game data</b> (tables.json / bestiary.json). Reload the page. '+e.message+'</p>'; return; }
const $ = s => document.querySelector(s);
const T = cap => TB.find(t => t.cap === cap) || TB.find(t => t.cap.startsWith(cap));

// ---------- dice ----------
const r = n => 1 + Math.floor(Math.random() * n);
function roll(expr){ // "2d6+1", "1d4", "3"
  expr = String(expr).replace(/\s/g,'').replace(/[–—]/g,'-');
  let tot = 0;
  for (const m of expr.matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g)){
    if (m[3]) { let s = 0; for (let i=0;i<(+m[2]||1);i++) s += r(+m[3]); tot += m[1]==='-'?-s:s; }
    else if (m[5]) tot += (m[4]==='-'?-1:1) * +m[5];
  }
  return tot;
}
function range(s){ s = String(s).replace(/[–—]/g,'-').trim();
  const m = s.match(/^(\d+)(?:\s*-\s*(\d+)|(\+))?$/); if(!m) return null;
  const v = x => x==='00'?100:+x; return [v(m[1]), m[3]?999:(m[2]!==undefined?v(m[2]):v(m[1]))]; }
// find a row in a table by roll; handles side-by-side halves (4-col tables with d in col 0 and 2)
function pick(t, v){
  for (const row of t.rows){
    const a = range(row[0]); if (a && v>=a[0] && v<=a[1]) return row.slice(1, t.head.length>3 && range(row[2]) ? 2 : undefined);
    if (row.length>=4 && t.head.length>=4 && /d\d|^$/.test(t.head[0]) && range(row[2])){ const b = range(row[2]); if (b && v>=b[0] && v<=b[1]) return row.slice(3); }
  }
  // multi-range "3–4, 6–8, 10–11"
  for (const row of t.rows){ for (const part of row[0].split(',')){ const a = range(part); if (a && v>=a[0] && v<=a[1]) return row.slice(1); } }
  return null;
}

// ---------- terrain ----------
const TERR = {
  'Grasslands':{c:'#c9d48a',mc:1,col:1,be:'Grassland',ic:''},
  'Forest':{c:'#6f9a55',mc:2,col:2,be:'Forest & Jungle',ic:'🌲'},
  'Hills':{c:'#b7a46a',mc:1,col:3,be:'Hills',ic:'⛰'},
  'Mountains':{c:'#8a7d70',mc:2,col:3,be:'Mountain',ic:'🏔'},
  'Jungle':{c:'#3f7d4a',mc:2,col:4,be:'Forest & Jungle',ic:'🌴'},
  'Swamp':{c:'#6c7a58',mc:2,col:5,be:'Swamp',ic:'〰'},
  'Desert':{c:'#e2c784',mc:1,col:6,be:'Desert',ic:'☀'},
  'Glacier':{c:'#dfe9ee',mc:2,col:7,be:'Glacier',ic:'❄'},
  'Sea / Lake':{c:'#6d9fc4',mc:99,col:8,be:'Sea/Lake',ic:'≈'},
};
const SEASONS = ['Spring','Summer','Fall','Winter'];
const CLIMATE = T('Climate by terrain');
function climate(terr){
  const key = {Hills:'Forest, Hills',Forest:'Forest, Hills'}[terr] || terr;
  const row = CLIMATE.rows.find(x => x[0]===key) || CLIMATE.rows[0];
  const s = G.season; const cell = s===1?row[2]:s===3?row[3]:row[1];
  return {name: cell.replace(/\*/g,'').trim(), harsh: /\*\*/.test(cell) ? 'always' : /\*/.test(cell) ? 'stormy' : ''};
}

// ---------- hex geometry (axial, pointy-top) ----------
const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const key = (q,r) => q+','+r;
const dist = (a,b) => (Math.abs(a.q-b.q)+Math.abs(a.q+a.r-b.q-b.r)+Math.abs(a.r-b.r))/2;
const nbrs = h => DIRS.map(d => ({q:h.q+d[0], r:h.r+d[1]}));

// ---------- state ----------
let G;
// ---------- characters (Shadowdark core: 3d6 stats, class HD + CON, 2d6×5 gp) ----------
const mod = v => v<=3?-4:v<=5?-3:v<=7?-2:v<=9?-1:v<=11?0:v<=13?1:v<=15?2:v<=17?3:4;
const HD = {Fighter:8,Priest:6,Thief:4,Wizard:4,Ranger:8,Bard:6,Knight:8,Seer:6,Witch:4,Warlock:6,'Basilisk Warrior':12,'Desert Rider':8,'Pit Fighter':8,'Sea Wolf':8,'Ras-Godai':6};
function makeChar(o){
  const st=o.stats; const cls=o.cls; const m=k=>mod(st[k]);
  const melee = /Thief|Ranger|Desert/.test(cls)?m('DEX'):m('STR');
  const ac = o.ac || ({Fighter:15,Knight:17,Priest:15,Thief:13,Ranger:13,Bard:13}[cls]||11)+(/Fighter|Knight|Priest/.test(cls)?0:m('DEX'));
  const hp = o.hp || Math.max(1, r(HD[cls]||6)+m('CON'));
  return {name:o.name, cls, anc:o.anc||'', lv:o.lv||1, hp, max:hp, ac, stats:st,
    atk: (/Wizard|Witch|Seer/.test(cls)?m('INT'):melee) + (cls==='Fighter'?1:0) + Math.floor((o.lv||1)/2),
    dmg: /Wizard|Witch/.test(cls)?'1d6':/Fighter|Knight|Ranger/.test(cls)?'1d8':/Thief/.test(cls)?'1d6':'1d6',
    int: m('INT'), dex:m('DEX'), cha:m('CHA'), con:st.CON, conMax:st.CON, gold:o.gold};
}
function randomChar(cls){
  const st={}; for(const k of ['STR','DEX','CON','INT','WIS','CHA']) st[k]=roll('3d6');
  const anc=['Human','Human','Human','Dwarf','Elf','Halfling','Half-Orc','Goblin'][r(8)-1];
  return makeChar({name:name(), cls, anc, stats:st, gold:roll('2d6')*5});
}
// Shadowdarklings JSON export (Download → JSON). Tolerant of field names.
function fromSDL(j){
  const s=j.stats||j.attributes||{}; const g=k=>+(s[k]??s[k.toLowerCase()]??10);
  const st={STR:g('STR'),DEX:g('DEX'),CON:g('CON'),INT:g('INT'),WIS:g('WIS'),CHA:g('CHA')};
  const gold=(+j.gold||0)+(+j.silver||0)/10+(+j.copper||0)/100;
  return makeChar({name:j.name||name(), cls:j.class||j.className||'Fighter', anc:j.ancestry||'', lv:+j.level||1, stats:st,
    hp:+(j.maxHitPoints||j.hitPoints||j.hp)||0, ac:+(j.armorClass||j.ac)||0, gold:Math.floor(gold)});
}
function chooseParty(){
  const commit = list => { G.chaos = !!(document.getElementById('chaos')||{}).checked; G.party=list; G.gold=list.reduce((a,c)=>a+(c.gold||0),0);
    log(`The company pools its purse: <b>${G.gold} gp</b> (${list.map(c=>c.name.split(' ')[0]+' '+(c.gold||0)).join(', ')}).`);
    // each starts with a crawling kit's food and light (SD core): 3 rations, 2 torches
    G.rations = 3*list.length; G.torches = 2*list.length;
    log(`Packs hold ${G.rations} rations and ${G.torches} torches. Spend gold at the first settlement you find.`);
    log('Day 1','day'); busy=true; rollWeather().then(()=>{ busy=false; render(); }); render(); };
  modal(`<h2>Your company</h2>
   <p>Make your characters at <a href="https://shadowdarklings.net" target="_blank">shadowdarklings.net</a>, then <b>Download → JSON</b> for each and load the files here (up to 6). Or roll a random level-1 company by the core rules: 3d6 in order, class hit die + CON, 2d6×5 gp each.</p>
   <p><label><input type="checkbox" id="chaos"> Chaos Mode (Solo Reference): reroll group initiative every round</label></p>
   <p><input type="file" id="sdl" accept=".json,application/json" multiple></p><p id="sdlmsg"></p>`,
   [['Roll a random company', ()=>commit(['Fighter','Priest','Thief','Wizard'].map(randomChar))],
    ['Load Shadowdarklings files', ()=>{
      const fs=[...document.getElementById('sdl').files].slice(0,6);
      if(!fs.length){ document.getElementById('sdlmsg').textContent='Choose one or more .json files first.'; return; }
      Promise.all(fs.map(f=>f.text())).then(ts=>{ try{
        const list=ts.flatMap(t=>{const j=JSON.parse(t); return Array.isArray(j)?j:[j];}).map(fromSDL);
        closeModal(); commit(list);
      }catch(e){ document.getElementById('sdlmsg').textContent='Could not read: '+e.message; } });
    }, true]]);
}
const CLASSES = {
  Fighter:{hp:10,ac:15,atk:3,dmg:'1d8',int:-1},
  Priest:{hp:8,ac:14,atk:2,dmg:'1d6',int:0,heal:true},
  Thief:{hp:7,ac:13,atk:2,dmg:'1d6',int:1},
  Wizard:{hp:5,ac:11,atk:2,dmg:'1d6+1',int:3},
};
function name(){
  const f = Math.random()<.5 ? T('Male') : T('Female');
  const p = pick(T('Surname — prefix'), r(100)), s = pick(T('Surname — suffix'), r(100));
  return pick(f, r(100))[0] + ' ' + (p?p[0]:'').replace(/-$/,'') + (s?s[0]:'').replace(/^-/,'');
}
function newGame(){ window.__G=()=>G;
  G = {foragedBy:{}, day:1, season:r(4)-1, prev:null, conds:[], gear:{fishing:false}, gold:0, rations:0, torches:0, mounts:0, loot:[], xp:0, clues:0,
       hexes:{}, pos:{q:0,r:0}, goal:{q:14,r:-3+r(5)}, mc:0, weather:null, wdays:0, buffs:{}, factions:{},
       party:[],
       over:false};
  // the road: a meandering line from start to goal
  let h = {...G.pos}; G.road = new Set([key(h.q,h.r)]);
  while (dist(h,G.goal)>0){
    const opts = nbrs(h).filter(n => dist(n,G.goal) < dist(h,G.goal));
    h = opts[r(opts.length)-1]; G.road.add(key(h.q,h.r));
  }
  makeHex(G.pos,'Grasslands'); Object.assign(G.hexes[key(0,0)],{feature:'Empty landscape', entered:true, seen:true});
  makeHex(G.goal,'Grasslands'); Object.assign(G.hexes[key(G.goal.q,G.goal.r)],{feature:'Settlement',band:'City',fname:'the City of '+name().split(' ')[1],known:true,fog:true});
  $('#log').innerHTML='';
  log(`<b>${G.season===0?'Spring':SEASONS[G.season]}.</b> Your company stands on a road in open grassland. Somewhere east, ${hexAt(G.goal).fname} waits. Follow the road, or strike out across the wilds.`);
  chooseParty();
}
const hexAt = p => G.hexes[key(p.q,p.r)];
function makeHex(p, force){
  let terr = force;
  if (!terr){
    const nb = nbrs(p).map(hexAt).filter(Boolean).filter(h=>h.terr!=='Sea / Lake');
    if (nb.length && Math.random()<.55) terr = nb[r(nb.length)-1].terr;
    else { const v=r(100); terr = pick(T('Terrain'),v)[0]; }
    if (G.road.has(key(p.q,p.r)) && terr==='Sea / Lake') terr='Grasslands';
  }
  return G.hexes[key(p.q,p.r)] = {q:p.q, r:p.r, terr, road:G.road.has(key(p.q,p.r)), seen:false, fog:false};
}

// ---------- log ----------
function log(html, cls=''){ const p=document.createElement('p'); p.innerHTML=html; if(cls)p.className=cls; $('#log').appendChild(p); $('#log').scrollTop=1e9; }
const tag = (tbl, v) => `<span class="tb">${tbl}</span> <span class="roll">${v}</span> `;
const alive = () => G.party.filter(c=>c.hp>0 && c.con>0);
const best = f => Math.max(...alive().map(f));
function check(mod, dc){ const d=r(20); return {d, ok: d+mod>=dc, tot:d+mod}; }
function fall(c){ if(c.hp<=0 && !c.dead && c.con>0 && !c.dying && !c.stable){ c.dying='new'; } }
function hurt(c, n, why){ c.hp=Math.max(0,c.hp-n); fall(c); log(`${c.name} takes <b>${n}</b>${why?' ('+why+')':''}.${c.hp<=0?' <b class="bad">Down.</b>':''}`, 'bad'); }
const anyone = () => { const a=alive(); return a[r(a.length)-1]; };

// ---------- render ----------
const S = 34;
function px(h){ return {x: S*Math.sqrt(3)*(h.q+h.r/2), y: S*1.5*h.r}; }
function render(){
  const svg = $('#map'); const here = hexAt(G.pos);
  const reach = new Set(G.over?[]:nbrs(G.pos).map(n=>key(n.q,n.r)));
  let s = ''; const P = px(G.pos);
  const W = svg.clientWidth||600, H = svg.clientHeight||400;
  svg.setAttribute('viewBox', `${P.x-W/2} ${P.y-H/2} ${W} ${H}`);
  const corners = c => [0,1,2,3,4,5].map(i=>{const a=Math.PI/180*(60*i-30);return (c.x+S*Math.cos(a)).toFixed(1)+','+(c.y+S*Math.sin(a)).toFixed(1)}).join(' ');
  // draw explored hexes + reachable fog hexes
  const cells = new Map(Object.values(G.hexes).filter(h=>h.seen||h.known).map(h=>[key(h.q,h.r),h]));
  for (const k of reach) if(!cells.has(k)) { const [q,rr]=k.split(',').map(Number); cells.set(k,{q,r:rr,fog:true}); }
  let roads='';
  for (const [k,h] of cells){
    const c = px(h); const unseen = !h.seen;
    s += `<polygon class="hex ${unseen?'fog':''} ${reach.has(k)?'reach':''}" data-k="${k}" points="${corners(c)}" fill="${unseen?'':TERR[h.terr].c}"><title>${unseen?'Unexplored':h.terr+(h.feature?' · '+(h.fname||h.feature):'')}</title></polygon>`;
    if (h.seen){
      const ic = h.feature==='Settlement'?'🏰':h.feature&&!/Empty/.test(h.feature)?'✦':TERR[h.terr].ic;
      if (ic) s+=`<text class="icon" x="${c.x}" y="${c.y}">${ic}</text>`;
      if (h.road) for (const n of nbrs(h)){ const o=G.hexes[key(n.q,n.r)]; if(o&&o.seen&&o.road){const d=px(o); roads+=`<line class="road" x1="${c.x}" y1="${c.y}" x2="${(c.x+d.x)/2}" y2="${(c.y+d.y)/2}"/>`;} }
    } else if (h.known) s+=`<text class="icon" x="${c.x}" y="${c.y}">🏰</text>`;
  }
  s += roads + `<circle cx="${P.x}" cy="${P.y}" r="9" fill="${'var(--acc)'}" stroke="#fff" stroke-width="2"/>`;
  svg.innerHTML = s;
  svg.querySelectorAll('.hex.reach').forEach(e=>e.onclick=()=>move(e.dataset.k));
  // HUD + party
  const w = G.weather;
  $('#hud').textContent = `Day ${G.day} · ${SEASONS[G.season]} · ${here.terr}${here.road?' (road)':''} · ${w?w.name+' — '+w.band:''} · MC ${Math.min(G.mc,budget())}/${budget()} · ${dist(G.pos,G.goal)} hexes to the City`;
  $('#party').innerHTML = `<table><tr><th>Name</th><th>Class</th><th>LV</th><th>HP</th><th>AC</th><th>CON</th></tr>${G.party.map(c=>`<tr class="${c.hp<=0||c.con<=0?'dead':''}"><td>${c.name}</td><td>${c.anc?c.anc+' ':''}${c.cls}</td><td>${c.lv}</td><td>${c.dying?'☠ dying ('+(c.dying==='new'?'?':c.dying)+')':c.stable?'stable 0':c.hp}/${c.max}</td><td>${c.ac}</td><td>${c.con}/${c.conMax}</td></tr>`).join('')}</table>
   <div class="res"><span>💰 ${G.gold} gp</span><span>🍖 ${G.rations} rations</span><span>🔥 ${G.torches} torches</span><span>🐎 ${G.mounts} mounts</span><span>🎒 ${G.loot.length} loot (${G.loot.reduce((a,b)=>a+b.gp,0)} gp)</span><span>⭐ ${G.xp} XP</span><span>🗝 ${G.clues} clues</span></div>`;
  save();
  const conds = G.conds.length ? '<div class="res" style="color:var(--acc)">'+G.conds.map(x=>x.label).join(' · ')+'</div>' : '';
  $('#party').insertAdjacentHTML('beforeend', conds);
  const acts = $('#actions'); acts.innerHTML='';
  const btn = (t,f,cls,dis) => { const b=document.createElement('button'); b.textContent=t; b.onclick=f; if(cls)b.className=cls; b.disabled=!!dis; acts.appendChild(b); };
  if (G.over){ btn('New journey', ()=>{ try{localStorage.removeItem(SKEY);}catch(e){} newGame(); }, 'main'); return; }
  if (G.wait){ btn(G.wait.label, G.wait.go, 'main roll'); $('#legend').textContent='Read the log, then roll.'; return; }
  if (busy){ $('#legend').textContent=''; return; }
  btn('Make camp (end day)', camp, 'main');
  const h0=here, row0=(T('Forage, hunt or fish').rows.find(x=>x[0]===h0.terr)||[]);
  const done0 = alive().every(c=>G.foragedBy&&G.foragedBy[c.name]);
  btn('Forage', ()=>forage('forage'), '', done0||row0[1]==='—');
  btn('Hunt', ()=>forage('hunt'), '', done0||row0[2]==='—');
  btn(G.gear.fishing?'Fish':'Fish (needs gear)', ()=>forage('fish'), '', done0||!G.gear.fishing||!(waterNear(h0)));
  if (here.feature==='Settlement') btn('Visit '+(here.fname||'settlement'), ()=>shop(false));
  if (here.feature && here.feature!=='Settlement' && !here.done && !/Empty/.test(here.feature)) btn('Explore the '+here.feature.split(/[.;(]/)[0]+' (optional)', ()=>exploreFeature(here));
  $('#legend').textContent = 'Click a highlighted neighbouring hex to move.';
}
const mounted = () => G.mounts >= alive().length && alive().length>0;
const budget = () => Math.max(1,(mounted()?6:4) - mcPenalty());

// ---------- explicit rolls: every die waits for the player's click ----------
// die(label, expr, mod) logs what is about to be rolled, shows a 🎲 button, and resolves with the total.
function die(label, expr, mod=0, note=''){
  return new Promise(res=>{
    const gate = expr==='—';
    log(`<span class="ask">${label}</span>${gate?'':` — roll <b>${expr}${mod?(mod>0?'+':'')+mod:''}</b>`}${note?' · '+note:''}`, 'pending');
    G.wait = {label:`🎲 ${gate?'Roll':'Roll '+expr+(mod?(mod>0?' +':' ')+mod:'')} — ${label}`, go:()=>{
      const v = gate?0:roll(expr)+mod; G.wait=null;
      const p=[...document.querySelectorAll('#log p.pending')].pop(); if(p){ p.classList.remove('pending'); if(!gate) p.innerHTML += ` → <span class="roll">${v}</span>`; }
      res(v);
    }};
    render();
  });
}
// one click rolls a d20 check for each listed character
async function checks(label, chars, modf, dc){
  if (!chars.length) return [];
  await die(`${label} DC ${dc} for ${chars.map(c=>c.name.split(' ')[0]).join(', ')}`, '—', 0, 'one d20 each');
  const out = chars.map(c=>{ const d=r(20), cm=condMod(c,'checks'), t=d+modf(c)+cm; const ok=t>=dc; log(`&nbsp;&nbsp;${c.name}: d20 ${d}${modf(c)?(modf(c)>0?'+':'')+modf(c):''}${cm?' '+cm+' (condition)':''} = <span class="roll">${t}</span> ${ok?'<span class="good">pass</span>':'<span class="bad">fail</span>'}`); return {c,ok,t}; });
  return out;
}
// ---------- conditions (Troubles and other lingering penalties) ----------
// {who:name|'all', kind:'checks'|'attacks'|'mc', val, ends:'rest3'|'rest'|'terrain'|'blessed'|'safe', days, label}
function addCond(c){ G.conds.push(c); log(`<i>Condition: ${c.label}.</i>`,'bad'); }
function condMod(c, kind){ const h=hexAt(G.pos); return (kind==='checks'?(G.buffs.checks||0):0) + G.conds.filter(x=>x.kind===kind && (x.who==='all'||x.who===c.name) && !(x.ends==='terrain' && !/Forest|Jungle|Swamp/.test(h.terr))).reduce((a,x)=>a+x.val,0); }
function tickConds(rested, safe){ // called at camp
  G.conds = G.conds.filter(x=>{
    if (x.ends==='rest3'){ if(rested) x.days=(x.days||0)+1; if(x.days>=3){ log(`<i>${x.label} — over after three days of rest.</i>`,'good'); return false; } }
    if (x.ends==='rest' && rested){ log(`<i>${x.label} — gone with the rest.</i>`,'good'); return false; }
    if (x.ends==='safe' && safe){ log(`<i>${x.label} — restored by a safe rest.</i>`,'good'); return false; }
    return true; });
}
const mcPenalty = () => Math.max(0, ...G.conds.filter(x=>x.kind==='mc').map(x=>x.val), 0);
const SAVE = {STR:c=>c.stats?mod(c.stats.STR):0, DEX:c=>c.dex||0, CON:c=>c.stats?mod(c.stats.CON):0, INT:c=>c.int||0, WIS:c=>c.stats?mod(c.stats.WIS):0, CHA:c=>c.cha||0};

// ---------- dying (Shadowdark core) ----------
// At 0 HP a character is dying for 1d4 + CON mod rounds (min 1). Each round they roll a d20: a natural 20 and
// they rise with 1 HP. An ally can stabilize them with an INT check DC 15, or pour a healing potion.
const dyingNow = () => G.party.filter(c=>c.dying);
async function dyingRound(){
  for (const c of dyingNow()){
    if (c.dying==='new'){ const cm=mod(c.stats?c.stats.CON:10); const n=Math.max(1, await die(`${c.name} is dying — how many rounds (1d4 + CON)`, '1d4', cm)); c.dying=n; log(`${c.name} has <b>${n}</b> round(s) to be saved.`,'bad'); continue; }
    const helpers = alive();
    const pi = G.loot.findIndex(x=>x.potion);
    if (helpers.length && pi>=0){ G.loot.splice(pi,1); c.hp=r(6)+1; c.dying=0; log(`${helpers[0].name} pours a healing potion: ${c.name} is back up with ${c.hp} HP.`,'good'); continue; }
    if (helpers.length){ const hb = helpers.reduce((a,b)=>b.int>a.int?b:a);
      const k = await checks(`${hb.name} tries to stabilize ${c.name} · INT`, [hb], x=>x.int, 15);
      if (k[0].ok){ c.dying=0; c.stable=true; log(`${c.name} is stable: unconscious at 0 HP until a rest.`,'good'); continue; } }
    const v = await die(`${c.name}'s death roll (natural 20 rises)`, '1d20');
    if (v===20){ c.dying=0; c.hp=1; log(`${c.name} gasps and rises with 1 HP!`,'good'); continue; }
    c.dying--; if (c.dying<=0){ c.dying=0; c.con=0; log(`<b>${c.name} dies.</b>`,'bad'); } else log(`${c.name}: ${c.dying} round(s) left.`,'bad');
  }
}
async function resolveDying(){ let guard=0; while (dyingNow().length && guard++<20) await dyingRound(); checkDeath(); }

// ---------- weather (§1) ----------
async function rollWeather(){
  const h = hexAt(G.pos); const t = T('Daily weather');
  let v = await die('Daily weather · '+h.terr, '2d6');
  if (G.weather && G.weather.band==='Excellent'){ const v2 = await die('Advantage from Excellent weather', '2d6'); v=Math.max(v,v2); }
  const row = t.rows.find(x=>+x[0]===v);
  let band = v<=4?'Stormy':v>=10?'Excellent':'Fair';
  const cl = climate(h.terr);
  const harsh = cl.harsh==='always' || (cl.harsh==='stormy' && band==='Stormy');
  if (band==='Stormy' && harsh) band='Severe';
  G.weather = {name:row[TERR[h.terr].col], band, harsh, climate:cl.name};
  log(`<b>${G.weather.name}</b> — ${band}. ${cl.name} climate${harsh?' (<b>harsh</b>: double rations)':''}. ${T('Weather bands').rows.find(x=>x[0].startsWith(band))?.[1]||''}`);
  G.wdays = await die('How long it lasts', '1d4'); log(`It lasts ${G.wdays} day(s).`);
  if (band==='Severe') await weatherEvent();
  render();
}
async function weatherEvent(){
  const h = hexAt(G.pos); const c = climate(h.terr).name;
  const t = G.weather.band==='Stormy'||G.weather.band==='Severe' ? (/Hot|Scorch|Swelter/.test(c)?T('Hot'):T('Cold')) : T('Fair-weather events');
  const v = await die('Weather event · '+t.cap, '2d6'); const row = pick(t,v);
  log(`<b>${row[0]}.</b> ${row[1]}`);
  await weatherEffect(t.cap, row[0]);
}
// Weather events (§9.1): one explicit handler per entry. Saves are DC 12 (the book gives none).
// Daily flags live in G.buffs and clear at dawn.
async function saveOrDamage(stat, dmg, who){ for (const k of await checks(stat+' save', who||alive(), SAVE[stat], 12)) if(!k.ok) hurt(k.c, /d/.test(dmg)? await die(`Damage to ${k.c.name}`, dmg) : +dmg); }
async function spoil(expr){ const n=Math.min(G.rations, await die('Rations lost', expr)); G.rations-=n; log(`${n} rations lost.`,'bad'); }
const B = f => Object.assign(G.buffs, f);
const WX = {
  'Wildfire':      async()=>{ await saveOrDamage('CON','1d4'); B({noforage:1}); },
  'Lightning storm':async()=>{ await saveOrDamage('DEX','1d6'); if(G.mounts){ const k=await checks('WIS to hold the mounts',[alive()[0]],SAVE.WIS,12); if(!k[0].ok){ G.mounts--; log('A mount bolts and is gone.','bad'); } } },
  'Heat wave':     async()=>{ await saveOrDamage('CON','1'); B({checks:-1, forageDC:3}); },
  'Flash flood':   async()=>{ B({mc:1}); await spoil('1d4'); },
  'Windstorm':     async()=>{ B({mc:1, nav:3, nofire:1}); },
  'Thunderstorm':  async()=>{ B({nav:3, nofire:1, norest:1}); },
  'Hailstorm':     async()=>{ await saveOrDamage('DEX','1'); B({nohunt:1}); },
  'Ground gives way':async()=>{ B({mc:1}); for (const k of await checks('DEX to keep your gear', alive(), SAVE.DEX, 12)) if(!k.ok){ if(G.torches){ G.torches--; log(`${k.c.name} loses a torch in the slide.`,'bad'); } } },
  'Swarm':         async()=>{ B({checks:-2, norest:1}); if(/Desert|Grasslands/.test(hexAt(G.pos).terr)){ B({noforage:1}); await spoil('1d4'); } },
  'Collapse':      async()=>{ await saveOrDamage('DEX','1d6'); B({mc:1}); },
  'Twister':       async()=>{ await saveOrDamage('DEX','2d6'); if(G.mounts){ log(`${G.mounts} mount(s) lost.`,'bad'); G.mounts=0; } await spoil('1d4'); },
  'Avalanche':     async()=>{ for (const k of await checks('DEX save', alive(), SAVE.DEX, 12)) if(!k.ok){ hurt(k.c, await die(`Avalanche on ${k.c.name}`,'2d6')); const d=await checks('STR to dig out',[k.c],SAVE.STR,12); if(!d[0].ok) hurt(k.c,1,'buried a round'); } B({mc:1}); },
  'Thundersnow':   async()=>{ await saveOrDamage('DEX','1d6'); B({nav:3}); },
  'Cold snap':     async()=>{ await saveOrDamage('CON','1'); B({needFire:1}); },
  'Freezing rain': async()=>{ B({mc:1, iceHex:1}); if(hexAt(G.pos).terr==='Swamp') B({nofire:1}); },
  'Ice gale':      async()=>{ B({mc:1, nav:3, nofire:1}); },
  'Blizzard':      async()=>{ B({mc:1, nav:3, coldNight:'1'}); },
  'Rime squall':   async()=>{ await saveOrDamage('DEX','1'); B({checks:-1}); },
  'Freezing fog':  async()=>{ B({nav:3, nightEnc:1}); },
  'Thin ice':      async()=>{ for (const k of await checks('DEX to stay on the ice', alive(), SAVE.DEX, 12)) if(!k.ok){ log(`${k.c.name} goes through.`,'bad'); await saveOrDamage('CON','1d6',[k.c]); } },
  'Ice jam':       async()=>{ await WX['Flash flood'](); },
  'Killing cold':  async()=>{ B({coldNight:'1d6', noforage:1}); },
  'Thaw':          async()=>{ B({crossing:1}); },
  'Haze':          async()=>{ B({nav:3}); },
  'Fog bank':      async()=>{ B({fleeEasy:1}); },
  'Still air':     async()=>{ B({noSurprise:1}); },
  'Bloom':         async()=>{ B({forageDC:-3}); },
};
async function weatherEffect(table, name){
  const f = WX[name]; if (!f){ log('(No mechanical effect.)'); return; }
  const before = {...G.buffs}; await f();
  const fx = []; const b=G.buffs;
  if (b.mc && !before.mc){ G.mc+=b.mc; fx.push(`+${b.mc} MC`); }
  if (b.nav) fx.push(`Navigation DC +${b.nav}`); if (b.checks) fx.push(`${b.checks} to checks today`);
  if (b.forageDC) fx.push(`Forage DC ${b.forageDC>0?'+':''}${b.forageDC}`); if (b.noforage) fx.push('no foraging'); if (b.nohunt) fx.push('no hunting');
  if (b.nofire) fx.push('no fire tonight'); if (b.norest) fx.push('no outdoor rest'); if (b.needFire) fx.push('no outdoor rest without a fire');
  if (b.coldNight) fx.push(`CON or ${b.coldNight} tonight without a fire`); if (b.nightEnc) fx.push('+1-in-6 on night checks');
  if (fx.length) log('<i>Today: '+fx.join(' · ')+'.</i>');
}
async function whoRandom(){ const a=alive(); if(a.length===1) return a[0]; const v=await die('Who? '+a.map((c,i)=>`${i+1} ${c.name.split(' ')[0]}`).join(' · '), '1d'+a.length); return a[v-1]; }

// ---------- move (§2) ----------
let busy=false;
async function move(k){ if(busy||G.wait) return; busy=true; try { await move_(k); } catch(e){ console.error(e); (window.__errs=window.__errs||[]).push(e.stack); } busy=false; render(); }
// MC to enter a hex (§2): terrain cost, a road on the edge used replaces it with 1; stormy makes everything 2.
function costInto(from, to){
  if (G.weather && (G.weather.band==='Stormy')) return 2;
  if (from.road && to.road) return 1;
  return TERR[to.terr].mc + (to.hard?1:0) - (to.short && TERR[to.terr].mc>1 ? 1 : 0);
}
async function move_(k){
  if (G.over) return;
  if (G.weather && G.weather.band==='Severe'){ log('Severe weather: terrain is impassable today. Make camp.','bad'); return; }
  let [q,rr] = k.split(',').map(Number); let dest = {q,r:rr};
  const from = hexAt(G.pos);
  const known = hexAt(dest) && hexAt(dest).seen ? hexAt(dest) : null;
  const left = budget()-G.mc;
  if (known && known.terr==='Sea / Lake'){ log('Open water. You need a boat for that.','bad'); return; }
  if (known && costInto(from,known) > left){ log(`Not enough MC left today (${left} left, ${known.terr} costs ${costInto(from,known)}). Make camp.`); return; }
  if (!known && left < 1){ log('The day is spent. Make camp.'); return; }
  if (from.chasm && from.chasm.includes(k)){ log('The chasm blocks that edge. Go around.','bad'); return; }
  // navigation (§2.1): only into open, unknown country; a road on the way is no check
  if (!known && !(from.road && G.road.has(k))){
    const dc = 12 + (G.weather.band==='Stormy'?3:0) + (G.buffs.nav||0) + (from.hard?3:0);
    const nav = best(c=>c.int+condMod(c,'checks'))+(G.favour?1:0);
    const v = await die(`Navigation · INT check DC ${dc} (best INT in the company)`, '1d20', nav);
    if (v>=dc) log('On course.','good');
    else {
      log('<b class="bad">Lost the way.</b> '+T('Navigation').rows[1][2]);
      const e = await die('Drift: which edge (1 east, then counter-clockwise)', '1d6'); dest = nbrs(G.pos)[e-1]; k=key(dest.q,dest.r);
      if (G.weather.band==='Stormy') { log(T('Navigation').rows[3][2],'bad'); G.stormDrift=true; }
    }
  } else if (!known) log('The road leads the way: no navigation check.');
  return enterHex(dest, from);
}
// Everything that puts the company in a hex goes through here: cost, reveal, feature, event, win.
async function enterHex(dest, from, free){
  const h = hexAt(dest) || makeHex(dest);
  const wasSeen = h.seen; h.seen = true;
  if (h.terr==='Sea / Lake'){ log(`${TERR['Sea / Lake'].ic} Open water blocks the way. You stay where you are.`); render(); return; }
  if (!free){
    const c = costInto(from, h), left = budget()-G.mc;
    if (c > left){ log(`You reach the edge of the ${h.terr.toLowerCase()} (${c} MC) with only ${left} MC left. You stop short and must camp.`); G.mc = budget(); render(); return; }
    G.mc += c;
  }
  if (G.stormDrift){ G.stormDrift=false; G.mc = budget(); }
  G.prev = {...G.pos}; G.pos = {q:h.q, r:h.r};
  if (G.patrol && !h.road){ G.patrol=0; log('You leave the road; the patrol rides on without you.'); }
  log(`→ <b>${h.terr}</b>${h.road?' along the road':''}. (MC ${Math.min(G.mc,budget())}/${budget()})`); render();
  if (h.feature==='Settlement' && h.band==='City' && dist(h,G.goal)===0) return win();
  if (h.feature==='Settlement' && G.favour){ G.favour=0; log('Divine favour ends at the settlement.'); }
  if (!h.entered){ h.entered=true; await feature(h); await hexEvent(h); }
  await resolveDying();
}

// ---------- feature (§4) ----------
async function feature(h){
  if (h.feature) return;
  const v = await die('Special feature', '2d6'); const row = pick(T('Special feature'), v); let txt = h.road?row[0]:row[1];
  if (/^1–3 Dungeon/.test(txt)) txt = (await die('Dungeon or Catacombs (1–3 / 4–6)','1d6'))<=3?'Dungeon':'Catacombs';
  if (/^1–3 Catacombs/.test(txt)) txt = (await die('Catacombs or Cavern (1–3 / 4–6)','1d6'))<=3?'Catacombs':'Cavern';
  let f = txt.split(/[.—]/)[0].trim();
  if (/Village/.test(f) && /Desert|Glacier/.test(h.terr)) f='Empty landscape';
  if (/Settlement/.test(txt)){ const b=await die('Settlement band: 1–3 Village, 4–5 Town, 6 City','1d6'); h.band=b<=3?'Village':b<=5?'Town':'City'; f='Settlement'; h.fname = name().split(' ')[1]+(h.band==='City'?' City':h.band==='Town'?'ton':'by'); }
  if (/^Village/.test(f)){ f='Settlement'; h.band='Village'; h.fname=name().split(' ')[1]+'by'; }
  if (/Trading Post|Tavern/.test(f)){ h.band='Post'; h.fname=f; f='Settlement'; }
  if (/Deep Chasm/.test(f)){ const e=await die('Chasm: which edge it runs along','1d6'); const n=nbrs(h); h.chasm=[n[e-1],n[e%6]].map(x=>key(x.q,x.r)); h.done=true; }
  h.feature=f;
  if (f!=='Empty landscape' && f!=='Settlement' && !h.done) log('<i>Exploring it is optional: use the button, or move on.</i>');
  log(f==='Empty landscape'?'No feature: empty landscape.':`<b>${h.fname?h.band+': '+h.fname:f}.</b> ${(T('What each feature is').rows.find(x=>f.startsWith(x[0]))||['',''])[1]}`);
  render();
}
async function exploreFeature(h){
  if(busy||G.wait) return; busy=true;
  try {
  h.done = true; const f = h.feature;
  if (/Shrine/.test(f) && !h.shrined){ h.shrined=1; const v=await die('Shrine','1d6'), row=pick(T('Shrine'),v); log(`<b>${row[0]}.</b> ${row[1]}`,'good'); if(/attack/.test(row[1]))G.buffs.atk=1; if(/AC/.test(row[1]))alive().forEach(c=>c.acB=1); }
  else if (/Portal/.test(f)){ log('The portal hums. You step through…'); const a=await die('Portal: shift east–west','1d5'), b=await die('Portal: shift north–south','1d5'); const d={q:G.pos.q+a-3,r:G.pos.r+b-3}; const hh=hexAt(d)||makeHex(d); if(hh.terr==='Sea / Lake')hh.terr='Grasslands'; log(`…and come out ${dist(d,G.goal)} hexes from the City.`); await enterHex(d, hexAt(G.pos), true); }
  if (/Shrine|Monastery/.test(f) && G.conds.some(x=>x.ends==='blessed')){ G.conds=G.conds.filter(x=>x.ends!=='blessed'); log('Blessed: the unholy taint lifts.','good'); }
  if (/Shrine|Portal/.test(f)) {}
  else if (/Monastery|Keep/.test(f)){ log(`The ${f} gives you shelter. A safe night here; you may rest.`,'good'); G.safe=true; }
  else {
    const rooms = await die(`How many chambers in the ${f}`, '1d3+1');
    for (let i=0;i<rooms && alive().length;i++){
      const v = await die(`Chamber ${i+1}: 1–3 occupied, 4–6 a find`, '1d6');
      if (v<=3) await encounter(['VERMIN','MINIONS','MINIONS','WEIRD','BOSS'][Math.min(4,i)], h, true);
      else { const tv=await die('Treasure 0–3','1d100'); gainLoot(pick(T('Treasure 0–3'),tv)[0]); }
    }
    if (alive().length){ const tb=avgLv()>=4?'Treasure 4–6':'Treasure 0–3'; const tv=await die('The hoard · '+tb,'1d100'); gainLoot(pick(T(tb),tv)[0]); }
  }
  await resolveDying();
  } finally { busy=false; render(); }
}
function gainLoot(txt){
  let gp=0; const m = txt.match(/\((\d+) (gp|sp|cp)( each)?\)|(\d+) (gp|sp|cp)/);
  if (m){ const n=+(m[1]||m[4]), u=m[2]||m[5]; gp = u==='gp'?n:u==='sp'?n/10:n/100; const each=txt.match(/(Two|Pair|trio|five|Six|six)/i); if(m[3]&&each) gp*= ({two:2,pair:2,trio:3,five:5,six:6})[each[1].toLowerCase()]; }
  gp = Math.max(0, Math.round(gp));
  if (/(\d+) (gp|sp|cp) (in|on)/.test(txt)){ G.gold+=gp; log(`${txt} → <b>+${gp} gp</b>`,'good'); }
  else { G.loot.push({txt,gp}); log(`Found: <b>${txt}</b>`,'good'); }
  G.xp += gp>=50?3:gp>=10?1:0; levelUp();
}

// ---------- hex events (§5) ----------
async function hexEvent(h, noWeather){
  const t = h.road ? T('Hex event — hex WITH') : T('Hex event — ROADLESS');
  const v = await die(h.road?'Hex event (road)':'Hex event (roadless)', '3d6'); const row = pick(t, v); const txt=row[0];
  log(txt);
  if (/^Quiet/.test(txt)) return;
  if (/^Divine favour/.test(txt)) { G.favour=1; return; }
  if (/^Hidden chest/.test(txt)) { G.clues++; const tv=await die('What is in the chest · Treasure 0–3','1d100'); gainLoot(pick(T('Treasure 0–3'),tv)[0]); return; }
  if (/^Dragon/.test(txt)) { const dc=/Forest|Jungle|Swamp|Mountains/.test(h.terr)?12:15; const k=await checks('DEX to hide', alive(), SAVE.DEX, dc); if(k.some(x=>!x.ok)){ log('<b>It stoops.</b> Fire washes the column.','bad'); for(const x of k) if(!x.ok) hurt(x.c, await die(`Dragonfire on ${x.c.name}`,'2d6')); } else log('You hide; the shadow passes.'); return; }
  if (/^Extraordinary/.test(txt)) return encounter((await die('1–3 Weird monster, 4–6 Boss','1d6'))<=3?'WEIRD':'BOSS',h);
  if (/^Weird/.test(txt)) return encounter('WEIRD',h);
  if (/^Weather/.test(txt)) { if(noWeather){ log('A second weather result: ignored, roll again.'); return hexEvent(h,true); } await weatherEvent(); return hexEvent(h,true); }
  if (/^Biome denizens/.test(txt)) return encounter('DENIZENS',h);
  if (/^NPC/.test(txt)) return npc();
  if (/^Vermin/.test(txt)) return encounter('VERMIN',h);
  if (/^Minions/.test(txt)) { const k=await checks('DEX to slip past', alive(), SAVE.DEX, 12); if(k.every(x=>x.ok)){log('You slip past unseen.','good');return;} return encounter('MINIONS',h); }
  if (/^Imperial patrol/.test(txt)) { G.patrol=1; log('An imperial patrol rides with you while you hold the road.','good'); return hexEvent(h,noWeather); }
  if (/^Cave entrance/.test(txt)) { h.feature = h.feature&&h.feature!=='Empty landscape'?h.feature:'Cave'; return; }
  if (/^Trouble/.test(txt)) return trouble();
  if (/^Ambush/.test(txt)) return encounter(await whatAppears(),h,false,true);
  if (/^Wilderness hazard/.test(txt)) return hazard(h);
  if (/^Corpse/.test(txt)) { const d=await die('Corpse','1d6'); log(['','Disease: CON DC 12.','Nothing.','Nothing.','1d6 gp.','3d6 gp.','One potion.'][d]);
    if(d===1){ const c=await whoRandom(); const k=await checks('CON vs disease',[c],SAVE.CON,12); if(!k[0].ok){c.con--; log(c.name+' sickens: −1 CON.','bad');}}
    if(d===4)G.gold+=await die('Coins','1d6'); if(d===5)G.gold+=await die('Coins','3d6'); if(d===6)G.loot.push({txt:'Healing potion',gp:25,potion:1}); }
}
async function whatAppears(){ const v=await die('What appears','2d6'); const row=pick(T('What appears'),v); log(row[0]); return /Boss/.test(row[0])?'BOSS':/Minion/.test(row[0])?'MINIONS':/Vermin/.test(row[0])?'VERMIN':/Weird/.test(row[0])?'WEIRD':'DENIZENS'; }
async function trouble(){
  const v=await die('Trouble','1d10'), row=pick(T('Troubles'),v); log(`<b>${row[0]}.</b> ${row[1]}`,'bad');
  const here=hexAt(G.pos);
  switch(v){
    case 1: { const d=await die('Smoke and fire: 1–3 +1 MC, 4–6 side edges impassable','1d6');
      if(d<=3){ G.mc++; log('+1 MC to cross.'); } else { const n=nbrs(here); here.chasm=(here.chasm||[]).concat([n[1],n[2],n[4],n[5]].map(x=>key(x.q,x.r))); here.fireUntil=G.day+1; log('Only the edges ahead and behind are open until you rest.'); } break; }
    case 2: { const d=await die('Bad weather: 1–2 camp, 3–4 an item blows away, 5–6 fog','1d6');
      if(d<=2){ G.mc=budget(); log('You must camp.'); }
      else if(d<=4){ if(G.torches){G.torches--; log('The wind takes a torch.');} else log('The wind takes nothing you will miss.'); }
      else { G.mc++; log('Fog: +1 MC.'); const l=await die('Fog: 50% chance of becoming lost (1–50 lost)','1d100'); if(l<=50) await lost(); }
      break; }
    case 3: { const n=Math.ceil(G.rations/2); G.rations-=n; log(`${n} rations lost.`,'bad'); break; }
    case 4: await lost(); break;
    case 5: { const a=await whoRandom(); let b=a; if(alive().length>1) while(b===a) b=await whoRandom(); for(const k of await checks('CON vs camp disease', a===b?[a]:[a,b], SAVE.CON, 12)) if(!k.ok) addCond({who:k.c.name,kind:'checks',val:-1,ends:'rest3',label:`${k.c.name}: camp disease, −1 to checks until treated or 3 days of rest`}); break; }
    case 6: for(const k of await checks('CON vs mosquitoes', alive(), SAVE.CON, 12)) if(!k.ok) addCond({who:k.c.name,kind:'checks',val:-1,ends:'never',label:`${k.c.name}: fevered bites, −1 to checks in Forest, Jungle or Swamp`, terrain:1}); G.conds.forEach(x=>{ if(x.terrain) x.ends='terrain'; }); break;
    case 7: { const c=await whoRandom(); hurt(c, await die(`Injury to ${c.name}`,'1d4')); addCond({who:c.name,kind:'mc',val:1,ends:'rest3',label:`${c.name}: terrain injury, the company loses 1 MC a day until treated or 3 days of rest`}); break; }
    case 8: for(const k of await checks('WIS vs the unholy site', alive(), SAVE.WIS, 12)) if(!k.ok) addCond({who:k.c.name,kind:'attacks',val:-1,ends:'blessed',label:`${k.c.name}: −1 to attacks until blessed or treated (a shrine, monastery or temple)`}); break;
    case 9: { const casters=alive().filter(c=>/Priest|Wizard|Witch|Seer|Warlock/.test(c.cls)); for(const k of await checks('CON vs magic drain', casters, SAVE.CON, 12)) if(!k.ok) addCond({who:k.c.name,kind:'spell',val:-1,ends:'safe',label:`${k.c.name}: loses a lowest-tier spell slot until a safe rest`}); if(!casters.length) log('No spellcaster in the company: no effect.'); break; }
    case 10: { log('Dead end. You backtrack.'); if(G.prev){ const p=hexAt(G.prev); G.mc += Math.min(budget()-G.mc, TERR[p.terr].mc); G.prev2=G.pos; G.pos={...G.prev}; log(`Back to the ${p.terr.toLowerCase()} (its MC spent).`); render(); } break; }
  }
}
async function lost(){
  const d=await die('Lost: 1–2 back to the previous hex, 3–6 a random adjacent hex','1d6'); G.mc++;
  if(d<=2){ if(G.prev){ G.pos={...G.prev}; log('You come out where you started.'); render(); } return; }
  const e=await die('Which edge','1d6'); const n=nbrs(G.pos)[e-1];
  await enterHex(n, hexAt(G.pos), true);
}
async function hazard(h){
  const v=await die('Wilderness hazard','2d6'), row=pick(T('Wilderness'),v); log(`<b>${row[0]}.</b> ${row[1]}`);
  if (v===3) return trouble();
  if (v===2) return encounter('WEIRD',h);
  if (v===12){ let choice; await modal(`<h2>Toll taker</h2><p>${row[1]}</p>`, [['Pay 10 gp',()=>choice='pay'],['Fight',()=>choice='fight'],['Slip past (DEX)',()=>choice='slip']]);
    if (choice==='pay'){ G.gold=Math.max(0,G.gold-10); log('You pay.'); return; }
    if (choice==='slip'){ const k=await checks('DEX to slip past', alive(), SAVE.DEX, 12); if(k.every(x=>x.ok)){ log('You slip by.','good'); return; } log('Spotted!','bad'); }
    return encounter('MINIONS',h); }
  if (v===8){ const c=await whoRandom(); const k=await checks('DEX vs trap',[c],SAVE.DEX,12); if(!k[0].ok) hurt(c, await die('Trap damage','1d6')); }
  if (v===9){ const c=await whoRandom(); const k=await checks('STR out of the quicksand',[c],SAVE.STR,12); if(!k[0].ok){ const n=Math.min(G.rations, await die('Rations lost','1d4')); G.rations-=n; log(`${c.name} struggles free; ${n} rations lost.`,'bad'); } }
  if (v===6||v===4||v===7) G.mc++;
  if (v===10) G.mc=Math.max(0,G.mc-1);
}
async function npc(){
  const v=await die('NPC encounter','1d20'), row=pick(T('NPC encounter'),v);
  log(`<b>${row[0]}.</b> ${row[1]}`);
  const rv = await die('Reaction · 2d6 + best CHA', '2d6', best(c=>c.cha||0)); const re = pick(T('3. Reaction'), Math.max(0,rv)) || ['Friendly'];
  log(`<b>${re[0]}.</b> ${re[1]||''}`);
  if (/Horse trader/.test(row[0])){ let buy; await modal(`<h2>Horse trader</h2><p>${row[1]}</p>`,[['Buy a mount (30 gp)',()=>buy=1],['Pass',()=>{}]]); if(buy&&G.gold>=30){G.gold-=30;G.mounts++;} return; }
  if (/Hunters/.test(row[0])) { G.rations += alive().length; log('You share their fire and their meat.','good'); }
  if (/Bandits|Wagon destroyed/.test(row[0]) || re[0]==='Hostile') return encounter('MINIONS', hexAt(G.pos));
}

// ---------- foes ----------
function foeTable(type, h){
  const be = TERR[h.terr].be;
  let tabs = BE.tables.filter(t=>t.type===type && t.terr.includes(be));
  if (!tabs.length) tabs = BE.tables.filter(t=>t.type===type && t.terr.some(x=>/Any|Grassland/.test(x)));
  if (!tabs.length) tabs = BE.tables.filter(t=>t.type===type);
  if (!tabs.length) tabs = BE.tables.filter(t=>t.type==='MINIONS');
  // "choose one and keep it": a faction per terrain per journey
  const fk = type+be; if (G.factions[fk]===undefined || !tabs[G.factions[fk]]) G.factions[fk]=r(tabs.length)-1;
  return tabs[G.factions[fk]];
}
async function rollFoe(type, h){
  const t = foeTable(type,h); const v = await die(`${t.name} (${type.toLowerCase()})`, t.die);
  const row = t.rows.find(x=>{const a=range(x.r);return a&&v>=a[0]&&v<=a[1];}) || t.rows[r(t.rows.length)-1];
  const b = row.b && BE.blocks[row.b];
  const ne = row.no.replace(/[^0-9d+\-]/g,'')||'1';
  let no = /d/.test(ne) ? Math.max(1, await die(`How many ${row.foe}`, ne)) : +ne||1;
  const lv = b?b.lv:({VERMIN:1,MINIONS:2,DENIZENS:2,WEIRD:4,BOSS:6})[type];
  // keep it survivable for a small company: cap total levels
  const cap = Math.max(2, 4*avgLv()+2); const was=no; while (no>1 && no*lv>cap) no--; if(no<was) log(`(Only ${no} of them close in: the rest hang back.)`);
  const am = b && b.atk.match(/([+-]\d+)\s*\(([^)]*?\d*d\d+(?:\s*[+-]\s*\d+)?)/);
  return {name: b?b.name:row.foe, table:t.name, v, no, type,
    ac: b?b.ac:10+lv, hp: b?b.hp:4+lv*4, atk: am?+am[1]:lv+1, dmg: am?am[2].replace(/[^0-9d+\-]/g,''):'1d6', lv, b};
}
const avgLv = () => alive().reduce((a,c)=>a+c.lv,0)/Math.max(1,alive().length);
// the creature's own "Reactions (d6)" line, if it has one
function ownReactions(b){ const l = b && b.traits.find(x=>/Reactions \(d6\)/.test(x)); if(!l) return null;
  return l.replace(/.*Reactions \(d6\)\.?\*?\*?\s*/,'').split('·').map(s=>{ const m=s.trim().match(/^(\d+)(?:[–-](\d+))?\s+(.*)$/); return m?{a:+m[1],b:+(m[2]||m[1]),t:m[3]}:null; }).filter(Boolean); }

async function encounter(type, h, inDungeon, ambush){
  const f = await rollFoe(type, h); const b=f.b;
  log(`<b>${f.no} × ${f.name}</b>${b&&b.desc?' — <i>'+b.desc+'</i>':''}`);
  const dv = await die('1. Distance','1d6'); const dist = pick(T('1. Distance'), dv)[0]; log('Range: <b>'+dist+'</b>.');
  const av = await die('2. Activity','2d6'); const act = pick(T('2. Activity'), av); log('Doing: <b>'+(act?act[0]:'—')+'</b>.');
  let re, hostile;
  if (ambush){ log('<b class="bad">Ambush!</b> They are undetected until they strike.'); hostile=true; re='Hostile'; }
  else {
    const rv = await die('3. Reaction · 2d6 + best CHA', '2d6', best(c=>c.cha||0)); re = (pick(T('3. Reaction'), Math.max(0,rv))||['Friendly'])[0];
    const rr = T('3. Reaction').rows.find(x=>x[1]===re); log(`<b>${re}.</b> ${rr?rr[2]:''}`);
    const own = ownReactions(b);
    if (own){ const ov = await die(`How a ${f.name} behaves · its Reactions table`, '1d6'); const o = own.find(x=>ov>=x.a&&ov<=x.b); if(o) log(`<i>${o.t}</i>`); }
    hostile = type==='BOSS' || re==='Hostile';
  }
  const html = `<h2>${f.no} × ${f.name}</h2><p><i>${type.toLowerCase()} · ${f.table}</i></p>${b&&b.desc?`<p>${b.desc}</p>`:''}
    ${b?`<div class="stat">${b.stat}</div>${b.traits.map(x=>`<p style="font-size:13px">${x.replace(/\*\*(.*?)\*\*/g,'<b>$1</b>')}</p>`).join('')}`:''}
    <p>Range <b>${dist}</b> · ${act?act[0]:''} · ${ambush?'<b class="bad">Ambush: they strike first.</b>':`Reaction <b>${re}</b>${hostile?' — they mean violence.':'.'}`}</p>
    <p style="font-size:13px;color:var(--soft)">The rolls are in the log. Choose what the company does.</p>`;
  let choice;
  const opts = [['Fight', ()=>choice='fight']];
  if (!ambush) opts.push(['Flee', ()=>choice='flee']);
  if (!hostile) opts.push(['Let them be', ()=>choice='leave']);
  else if (!ambush && type!=='DENIZENS' && type!=='VERMIN') opts.push(['Pay them off (15 gp)', ()=>choice='pay']);
  await modal(html, opts);
  if (choice==='leave'){ log('You give them a wide berth.'); return; }
  if (choice==='flee'){ const dc = (dist==='Close'?15:dist==='Near'?12:9) - (G.buffs.fleeEasy?3:0); const v = await die(`Flee · DEX check DC ${dc} (best DEX)`, '1d20', best(c=>c.dex+(c.cls==='Thief'?1:0)));
    if (v>=dc){ log('You get clear.','good'); G.mc++; return; } log('<b>They catch you.</b>','bad'); return fight(f,true); }
  if (choice==='pay'){ if (G.gold<15){ log('You have not got it.','bad'); return fight(f,false); } const v=await die('Will they take the coin? (3–6 yes)','1d6'); if(v>2){ G.gold-=15; log('Coin changes hands. They let you go.'); return; } log('They take nothing but blood.','bad'); return fight(f,false); }
  return fight(f, ambush);
}
async function fight(f, theyFirst){
  const foes = Array.from({length:f.no},()=>({hp:f.hp}));
  let round = 0;
  const half = Math.ceil(f.no/2);
  const mindless = f.b&&/Mindless|Immune to morale/.test(f.b.traits.join(' '));
  log(`<b>Combat</b> with ${f.no} × ${f.name} (AC ${f.ac}, HP ${f.hp} each, attack +${f.atk}, ${f.dmg}).`);
  let lines=[];
  // initiative (SD 82–85, solo group initiative SoD 1): one roll per side, d20 + best DEX mod; the monsters use theirs
  const fdex = f.b ? +((f.b.stat.match(/\bD ([+-]\d+)/)||[])[1]||0) : 0;
  const rollInit = async () => { const pv = await die('Initiative · the company (d20 + best DEX)', '1d20', best(c=>c.dex||0)); const ev = await die(`Initiative · ${f.name} (d20 + DEX ${fdex>=0?'+':''}${fdex})`, '1d20', fdex);
    const first = pv>=ev; log(first?'<b>The company acts first.</b>':`<b>The ${f.name} act first.</b>`); return first; };
    const pturn = () => { for (const c of alive()){ const t=foes.find(x=>x.hp>0); if(!t)break;
      if (c.cls==='Priest' && c.heal!==G.day){ const w=alive().find(x=>x.hp<=x.max/3); if(w){ c.heal=G.day; const n=r(6)+1; w.hp=Math.min(w.max,w.hp+n); lines.push(`${c.name} heals ${w.name}: 1d6+1 = ${n}.`); continue; } }
      const bon=c.atk+(G.buffs.atk||0)+(G.favour?1:0)+(G.patrol&&hexAt(G.pos).road?1:0)+condMod(c,'attacks'); const d20=r(20), a=d20+bon;
      if (d20===20 || (d20!==1 && a>=f.ac)){ const d=roll(c.dmg)+(d20===20?roll(c.dmg):0); t.hp-=d; lines.push(`${c.name}: d20 ${d20}+${bon} = ${a} vs AC ${f.ac} — <b>hit</b>, ${c.dmg} → ${d}${d20===20?' (crit)':''}${t.hp<=0?' — <b>it falls</b>':''}.`); }
      else lines.push(`${c.name}: d20 ${d20}+${bon} = ${a} vs AC ${f.ac} — miss.`); } };
    const fturn = (adv) => { for (const x of foes) if (x.hp>0){ const a0=alive(); if(!a0.length)break; const c=a0[r(a0.length)-1]; const d20=adv?Math.max(r(20),r(20)):r(20), a=d20+f.atk, ac=c.ac+(c.acB||0);
      if (d20===20 || (d20!==1 && a>=ac)){ const d=Math.max(1,roll(f.dmg)); c.hp=Math.max(0,c.hp-d); if(c.hp<=0){ c.stable=false; fall(c); } lines.push(`<span class="bad">${f.name} → ${c.name}: d20 ${d20}+${f.atk} = ${a} vs AC ${ac} — hit, ${f.dmg} → ${d}${c.hp<=0?' — <b>down</b>':''}.</span>`);}
      else lines.push(`${f.name} → ${c.name}: d20 ${d20}+${f.atk} = ${a} vs AC ${ac} — miss.`); } };
  if (theyFirst){ await die(`Surprise! The ${f.name} act before initiative, with advantage`, '—'); lines=[]; fturn(true); log(lines.join('<br>')); render(); if (dyingNow().length) await dyingRound(); }
  let partyFirst = alive().length ? await rollInit() : true;
  while (alive().length && foes.some(x=>x.hp>0) && round<30){
    round++;
    if (G.chaos && round>1) partyFirst = await rollInit();
    await die(`Combat · round ${round} (${foes.filter(x=>x.hp>0).length} ${f.name} standing)`, '—', 0, 'every attack this round');
    lines=[];

    if (partyFirst){ pturn(); fturn(); } else { fturn(); pturn(); }
    log(lines.join('<br>')); render();
    if (dyingNow().length) await dyingRound();
    const left = foes.filter(x=>x.hp>0).length;
    if (left && left<=half && f.type!=='BOSS' && !mindless && !foes.moraleDone){ foes.moraleDone=true;
      const mv = await die(`Morale · ${f.name} at half strength · WIS DC 15`, '1d20', Math.floor(f.lv/2));
      if (mv<15){ log(`<b>Morale breaks.</b> The ${f.name} scatter.`,'good'); foes.forEach(x=>x.hp=0); } else log('They hold.'); }
  }
  await resolveDying();
  if (alive().length && !foes.some(x=>x.hp>0)){
    const xp = f.lv*f.no; G.xp += xp; log(`Victory. +${xp} XP.`,'good');
    if (f.type!=='VERMIN' && f.type!=='DENIZENS'){ const tv=await die('Do they carry anything? (3–6 yes)','1d6'); if(tv>=3){ const tbl=f.lv>=7?'Treasure 7–9':f.lv>=4?'Treasure 4–6':'Treasure 0–3'; const v=await die(tbl,'1d100'); gainLoot(pick(T(tbl),v)[0]); } }
    if (f.type==='DENIZENS'){ const bv=await die('Is it good eating? (4–6 yes)','1d6'); if(bv>=4){ const n=await die('Rations from the kill','1d4'); G.rations+=n; log(`+${n} rations.`,'good'); } }
    levelUp();
  }
}
function levelUp(){
  for (const c of alive()){ while (c.lv<10 && G.xp >= 25*c.lv*(c.lv+1)/2){ c.lv++; const g=Math.max(1,r(HD[c.cls]||6)+mod(c.stats?c.stats.CON:10)); c.max+=g; c.hp+=g; if(c.lv%2) c.atk++; log(`⭐ <b>${c.name}</b> reaches level ${c.lv} (+${g} HP).`,'good'); } }
}

// ---------- forage (§8.2) & camp (§8) ----------
// §8.2: once a day per character, INT vs the terrain's DC. Forage/fish success = 1 ration; hunt = What the hunt brings.
function waterNear(h){ return nbrs(h).some(n=>{const o=hexAt(n); return o&&o.seen&&o.terr==='Sea / Lake';}); }
async function forage(kind){
  if(busy||G.wait) return; busy=true;
  try {
  const h = hexAt(G.pos); const tb = T('Forage, hunt or fish');
  const col = {forage:1, hunt:2, fish:3}[kind];
  const row = (kind==='fish' && waterNear(h)) || (h.road && false) ? tb.rows.find(x=>/River or coast/.test(x[0])) : (tb.rows.find(x=>x[0]===h.terr) || tb.rows[0]);
  let dc = row[col]==='—' || !row[col] ? null : +row[col];
  if (dc===null){ log(`No ${kind==='fish'?'fishing':kind==='hunt'?'hunting':'foraging'} here (— on the table).`); return; }
  if (G.weather.harsh) dc = 18;
  if (kind==='forage' && G.buffs.forageDC) dc += G.buffs.forageDC;
  if ((kind==='forage'&&G.buffs.noforage)||(kind==='hunt'&&G.buffs.nohunt)){ log(`The weather forbids ${kind==='hunt'?'hunting':'foraging'} today.`); return; }
  if (kind==='forage' && h.muddy) log('Muddy terrain: foraging costs double (MC +2 more).');
  const who = alive().filter(c=>!G.foragedBy[c.name]);
  if (!who.length){ log('Everyone has already tried today.'); return; }
  who.forEach(c=>G.foragedBy[c.name]=kind);
  let got = 0;
  for (const k of await checks(`${kind[0].toUpperCase()+kind.slice(1)} · INT`, who, c=>c.int, dc)){
    if (k.ok){
      if (kind==='hunt'){ const v=await die(`What ${k.c.name} brings back`,'2d6'), w=pick(T('What the hunt brings'),v); got += +w[0]; log(`${w[1]} (+${w[0]} rations)`,'good'); if(v===12){ G.rations+=got; got=0; await encounter(await whatAppears(),h); } }
      else { got += 1; log(`${k.c.name}: +1 ration.`,'good'); }
    } else { const m=await die(`Mishap for ${k.c.name} (${kind})`,'1d10'), mr=pick(T('Mishaps'),m); const txt=mr[col-1]; log(txt);
      const dm = txt.match(/(\d+) damage/); if (dm) hurt(k.c,+dm[1]);
      if (/DC 12 or 1 more/.test(txt)){ const s=/STR/.test(txt)?'STR':'DEX'; const x=await checks(s,[k.c],SAVE[s],12); if(!x[0].ok) hurt(k.c,1); }
      if (/Disadvantage/.test(txt)) addCond({who:k.c.name,kind:'checks',val:-2,ends:'rest',label:`${k.c.name}: ${txt.split('.')[0].toLowerCase()} (−2 to checks until rest)`});
      if (/lose the gear|Gear breaks/.test(txt) && kind==='fish'){ G.gear.fishing=false; log('The fishing gear is lost.','bad'); } }
  }
  await resolveDying();
  G.rations += got; const cost = 2 + (kind==='forage'&&h.muddy?2:0); G.mc = Math.min(budget(), G.mc+cost); log(`It takes half the day (MC +${cost}). +${got} rations.`);
  } finally { busy=false; render(); }
}
async function camp(){ if(busy||G.wait) return; busy=true; try { await camp_(); } catch(e){ console.error(e); (window.__errs=window.__errs||[]).push(e.stack); } busy=false; render(); }
async function camp_(){
  const h = hexAt(G.pos);
  if (!G.weather) await rollWeather();
  log(`Camp in the ${h.terr.toLowerCase()}.`);
  // daytime encounter checks (2 × 1-in-6) for the half-days just travelled
  for (let i=0;i<2 && alive().length;i++){ const v=await die(`Encounter check · ${i?'afternoon':'morning'} (1 = encounter)`,'1d6'); if(v===1){ log('Something finds you on the road.','bad'); await encounter(await whatAppears(),h); } }
  // rations (§8.1): each living character, then each mount; harsh climate doubles it. Who goes without is named.
  const mult = G.weather.harsh ? 2 : 1;
  const eaters = G.party.filter(c=>!c.dead && c.con>0);   // the downed eat too
  const fed = new Set(); let mountsFed = 0;
  for (const c of eaters){ if (G.rations>=mult){ G.rations-=mult; fed.add(c.name); } }
  for (let i=0;i<G.mounts;i++){ if (G.rations>=mult){ G.rations-=mult; mountsFed++; } }
  const hungry = eaters.filter(c=>!fed.has(c.name));
  log(`The company eats: ${fed.size} of ${eaters.length} characters${G.mounts?`, ${mountsFed} of ${G.mounts} mounts`:''} (${mult} ration${mult>1?'s each, harsh climate':' each'}). ${G.rations} left.`);
  if (hungry.length){ log(`<b>Short of food.</b> ${T('Going hungry').rows[1][1]}`,'bad'); for (const c of hungry){ c.con--; log(`${c.name} goes hungry: −1 CON (${c.con}).`,'bad'); } }
  const starvedMounts = G.mounts - mountsFed;
  if (starvedMounts>0){ G.mountCon = (G.mountCon||0)+starvedMounts; log(`${starvedMounts} mount(s) go hungry.`,'bad'); if (G.mountCon>=3){ G.mounts--; G.mountCon=0; G.rations+=4; log('A starving mount collapses; you butcher it. +4 rations.','bad'); } }
  else G.mountCon = 0;
  // fire (§8.4): 3 torches
  let fire = G.torches>=3 && G.weather.band!=='Severe' && !(G.buffs.nofire);
  if (!fire && G.buffs.coldNight && !G.safe) await saveOrDamage('CON', G.buffs.coldNight);
  if (fire){ G.torches-=3; log('A fire burns through the night (3 torches).'); } else log('No fire tonight.','bad');
  // overnight checks
  let interrupted = false;
  if (G.safe) log('Safe walls tonight: no night checks.');
  else for (let i=0;i<2 && alive().length;i++){ const th=(fire?1:2)+(G.buffs.nightEnc||0); const v=await die(`Night check ${i+1} (1${th>1?'–'+th:''} = encounter)`,'1d6'); if(v<=th){ interrupted=true; log('Something comes in the dark.','bad'); await encounter(await whatAppears(),h, false, (await die('Do they catch you sleeping? (4–6 yes)','1d6'))>=4); } }
  // rest (§8.4): eight hours and a ration. It gives back all HP and all stat damage.
  const canRest = ((G.weather.band!=='Stormy' && G.weather.band!=='Severe' && !G.buffs.norest && !(G.buffs.needFire && !fire)) || G.safe);
  if (canRest){
    await resolveDying(); const sleepers = G.party.filter(c=>!c.dead && c.con>0 && !c.dying && fed.has(c.name));
    const k = interrupted ? await checks('CON to keep the rest after the interruption', sleepers, SAVE.CON, 12) : sleepers.map(c=>({c,ok:true}));
    for (const x of k){ if(x.ok){ x.c.hp=x.c.max; x.c.con=x.c.conMax; if(x.c.stable){ x.c.stable=false; log(`${x.c.name} wakes.`,'good'); } } else log(`${x.c.name}'s rest is broken: the ration is spent for nothing.`,'bad'); }
    const unfed = alive().filter(c=>!fed.has(c.name)); if (unfed.length) log(`No ration, no rest: ${unfed.map(c=>c.name).join(', ')}.`,'bad');
    tickConds(true, G.safe);
    log('The night passes.');
  } else { log('<span class="bad">No outdoor rest in this weather.</span>'); tickConds(false, false); }
  await resolveDying();
  checkDeath(); if (G.over) return;
  await newDay();
}
async function newDay(){
  G.day++; G.mc=0; G.safe=false; G.foragedBy={}; G.buffs={}; G.party.forEach(c=>c.acB=0);
  if (G.day % 30 === 0){ G.season=(G.season+1)%4; log(`<b>${SEASONS[G.season]} comes.</b>`); }
  log(`Day ${G.day}`, 'day');
  if (--G.wdays <= 0) await rollWeather(); else log(`Still ${G.weather.name.toLowerCase()} (${G.weather.band}).`);
}

// ---------- settlements (§15) ----------
function shop(first){
  const h = hexAt(G.pos);
  const mark = first ? 0 : ({City:0,Town:.1,Village:.2,Post:.2})[h.band]||.1;
  const p = n => Math.ceil(n*(1+mark));
  const loot = G.loot.reduce((a,b)=>a+b.gp,0);
  const buyer = ({City:1,Town:.75,Village:.5,Post:.5})[h.band]||.75;
  const items = [
    ['Ration ×5', p(3), ()=>G.rations+=5],
    ['Torch ×3', p(1), ()=>G.torches+=3],
    ['Mount', p(30), ()=>G.mounts++],
    ['Fishing gear', p(1), ()=>G.gear.fishing=true],
    ['Healing potion', p(30), ()=>G.loot.push({txt:'Healing potion',gp:15,potion:1})],
  ];
  const draw = () => {
    const html = `<h2>${first?'Startown market':(h.fname||'Settlement')+' · '+h.band}</h2>
     <p>${first?'Outfit your company before the road. Mounts double your daily movement (6 MC instead of 4), but each eats a ration a day.':T('Prices').rows.find(x=>x[0]===h.band)?.slice(1).join(' · ')||''}</p>
     <p>💰 <b>${G.gold} gp</b> · 🍖 ${G.rations} · 🔥 ${G.torches} · 🐎 ${G.mounts} · 🎒 loot worth ${loot} gp</p>`;
    const opts = items.map(([n,c,f])=>[`${n} — ${c} gp`, ()=>{ if(G.gold>=c){G.gold-=c;f();} draw(); }, true]);
    if (!first){
      opts.push([`Sell loot (half value)`, async ()=>{ let s=0; const keep=[]; for (const x of G.loot){ if(x.potion){keep.push(x);continue;} const v = buyer>=1 ? 1 : await die(`Is there a buyer for ${x.txt}? (1–${Math.round(buyer*100)} yes)`,'1d100'); if(v<=buyer*100){ s+=Math.floor(x.gp/2); log(`Sold: ${x.txt} for ${Math.floor(x.gp/2)} gp.`); } else { keep.push(x); log(`No buyer for ${x.txt}.`); } } G.loot=keep; G.gold+=s; log(`Sold loot for ${s} gp.`,'good'); draw(); }]);
      opts.push(['Inn: rest the night (2 gp each)', ()=>{ const c=2*alive().length; if(G.gold>=c){G.gold-=c; G.safe=true; G.party.forEach(x=>{if(x.con>0){x.hp=x.max;x.con=x.conMax;}}); G.conds=G.conds.filter(x=>x.ends!=='safe'&&x.ends!=='rest'); closeModal(); log('A roof, a bed, a hot meal. Everyone recovers fully.','good'); newDay().then(render);} else draw(); }]);
      opts.push(['Ask for news (1 gp)', async ()=>{ if(G.gold<1)return draw(); G.gold--; const v=await die('Settlement event','1d20'), row=pick(T('Settlement events'),v); log(`<b>${row[0]}.</b> ${row[1]}`); draw(); }]);
      if (alive().length<4 && h.band!=='Post') opts.push(['Hire a sellsword (25 gp)', ()=>{ if(G.gold>=25){G.gold-=25; const h=randomChar('Fighter'); h.gold=0; h.name+=' (sellsword)'; G.party.push(h); log('A sellsword joins the company.','good');} draw(); }, true]);
    }
    opts.push([first?'Set out':'Leave', ()=>{ closeModal(); if(first){ log('Day 1','day'); busy=true; rollWeather().then(()=>{busy=false;render();}); } render(); }]);
    modal(html, opts);
  };
  draw();
}

// ---------- modal ----------
function modal(html, opts){
  return new Promise(res=>{
    $('#mbox').innerHTML = html + '<div class="btns"></div>';
    for (const [t,f,keep] of opts){ const b=document.createElement('button'); b.textContent=t; b.onclick=()=>{ try{ if(!keep) closeModal(); f(); }catch(e){ console.error(e); (window.__errs=window.__errs||[]).push(e.stack); } res(); }; $('#mbox .btns').appendChild(b); }
    $('#modal').hidden=false; render();
  });
}
function closeModal(){ $('#modal').hidden=true; }

// ---------- end ----------
function checkDeath(){
  for (const c of G.party) if (c.con<=0 && !c.dead){ c.dead=true; c.hp=0; log(`<b>${c.name} the ${c.cls} is dead.</b>`,'bad'); }
  if (!G.over && !alive().length && !dyingNow().length && $('#modal').hidden!==false){ G.over=true; modal(`<h2>The wilds keep you</h2><p>The company is lost on day ${G.day}, ${dist(G.pos,G.goal)} hexes short of the City.</p>`,[['Again',newGame]]); }
}
function win(){
  G.over=true; const score = G.gold + G.loot.reduce((a,b)=>a+b.gp,0) + G.xp*5 + alive().length*50 - G.day*5;
  modal(`<h2>The City at last</h2><p>Day ${G.day}. ${alive().length} of the company walk through the gate: ${alive().map(c=>c.name).join(', ')}.</p><p>Gold ${G.gold} · loot ${G.loot.reduce((a,b)=>a+b.gp,0)} gp · XP ${G.xp}</p><p><b>Score ${score}</b></p>`,[['New journey',newGame]]);
}
window.addEventListener('resize', ()=>G&&render());
// ---------- save / resume (this browser only) ----------
const SKEY='ohx-save-v1';
function save(){ if(!G || G.wait || busy || !G.party.length || !$('#modal').hidden) return;
  try { const logs=[...document.querySelectorAll('#log p')].slice(-300).map(p=>[p.className,p.innerHTML]);
    localStorage.setItem(SKEY, JSON.stringify({v:1, G:{...G, road:[...G.road], wait:null}, logs})); } catch(e){} }
function load(){ try { const d=JSON.parse(localStorage.getItem(SKEY)||'null'); if(!d||d.v!==1||!d.G||!d.G.party||!d.G.party.length) return null; return d; } catch(e){ return null; } }
const saved = load();
if (saved){
  G = {...saved.G, road:new Set(saved.G.road), wait:null};
  G.conds=G.conds||[]; G.foragedBy=G.foragedBy||{}; G.gear=G.gear||{fishing:false};
  window.__G=()=>G;
  for (const [c,h] of saved.logs){ const p=document.createElement('p'); p.className=c; p.innerHTML=h; $('#log').appendChild(p); }
  $('#log').scrollTop=1e9;
  modal(`<h2>Welcome back</h2><p>Day ${G.day}, ${dist(G.pos,G.goal)} hexes from the City. ${G.over?'That journey is over.':''}</p>`,
    [[G.over?'Look at it':'Continue the journey', ()=>{ if(!G.weather){ busy=true; rollWeather().then(()=>{busy=false;render();}); } render(); }],
     ['Start a new journey', ()=>{ try{localStorage.removeItem(SKEY);}catch(e){} newGame(); }]]);
} else newGame();
})();
