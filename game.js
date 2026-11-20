// Overland Hexcrawl — a travel game driven by the Overland Hexcrawl Simplified tables
// and the Thematic Foe Tables & Wildland bestiary.
(async function(){
const TB = await (await fetch('tables.json')).json();
const BE = await (await fetch('bestiary.json')).json();
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
  const commit = list => { G.party=list; G.gold=list.reduce((a,c)=>a+(c.gold||0),0);
    log(`The company pools its purse: <b>${G.gold} gp</b> (${list.map(c=>c.name.split(' ')[0]+' '+(c.gold||0)).join(', ')}).`); shop(true); };
  modal(`<h2>Your company</h2>
   <p>Make your characters at <a href="https://shadowdarklings.net" target="_blank">shadowdarklings.net</a>, then <b>Download → JSON</b> for each and load the files here (up to 6). Or roll a random level-1 company by the core rules: 3d6 in order, class hit die + CON, 2d6×5 gp each.</p>
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
  G = {day:1, season:r(3)-1, gold:0, rations:12, torches:6, mounts:0, loot:[], xp:0, clues:0,
       hexes:{}, pos:{q:0,r:0}, goal:{q:14,r:-3+r(5)}, mc:0, weather:null, wdays:0, buffs:{}, factions:{},
       party:[],
       over:false};
  // the road: a meandering line from start to goal
  let h = {...G.pos}; G.road = new Set([key(h.q,h.r)]);
  while (dist(h,G.goal)>0){
    const opts = nbrs(h).filter(n => dist(n,G.goal) < dist(h,G.goal));
    h = opts[r(opts.length)-1]; G.road.add(key(h.q,h.r));
  }
  makeHex(G.pos,'Grasslands'); G.hexes[key(0,0)].feature='Settlement'; G.hexes[key(0,0)].band='Town'; G.hexes[key(0,0)].fname='Startown';
  makeHex(G.goal,'Grasslands'); Object.assign(G.hexes[key(G.goal.q,G.goal.r)],{feature:'Settlement',band:'City',fname:'the City of '+name().split(' ')[1],known:true,fog:true});
  $('#log').innerHTML='';
  log(`<b>${G.season===0?'Spring':SEASONS[G.season]}.</b> Your company sets out from <b>Startown</b>. Somewhere east, ${hexAt(G.goal).fname} waits. Follow the road, or strike out across the wilds.`);
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
function hurt(c, n, why){ c.hp=Math.max(0,c.hp-n); log(`${c.name} takes <b>${n}</b>${why?' ('+why+')':''}.${c.hp<=0?' <b class="bad">Down.</b>':''}`, 'bad'); }
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
  $('#party').innerHTML = `<table><tr><th>Name</th><th>Class</th><th>LV</th><th>HP</th><th>AC</th><th>CON</th></tr>${G.party.map(c=>`<tr class="${c.hp<=0||c.con<=0?'dead':''}"><td>${c.name}</td><td>${c.anc?c.anc+' ':''}${c.cls}</td><td>${c.lv}</td><td>${c.hp}/${c.max}</td><td>${c.ac}</td><td>${c.con}/${c.conMax}</td></tr>`).join('')}</table>
   <div class="res"><span>💰 ${G.gold} gp</span><span>🍖 ${G.rations} rations</span><span>🔥 ${G.torches} torches</span><span>🐎 ${G.mounts} mounts</span><span>🎒 ${G.loot.length} loot (${G.loot.reduce((a,b)=>a+b.gp,0)} gp)</span><span>⭐ ${G.xp} XP</span><span>🗝 ${G.clues} clues</span></div>`;
  const acts = $('#actions'); acts.innerHTML='';
  const btn = (t,f,cls,dis) => { const b=document.createElement('button'); b.textContent=t; b.onclick=f; if(cls)b.className=cls; b.disabled=!!dis; acts.appendChild(b); };
  if (G.over){ btn('New journey', newGame, 'main'); return; }
  btn('Make camp (end day)', camp, 'main');
  btn('Forage / hunt', forage, '', G.foraged);
  if (here.feature==='Settlement') btn('Visit '+(here.fname||'settlement'), ()=>shop(false));
  if (here.feature && here.feature!=='Settlement' && !here.done && !/Empty/.test(here.feature)) btn('Explore the '+here.feature.split(/[.;(]/)[0], ()=>exploreFeature(here));
  $('#legend').textContent = 'Click a highlighted neighbouring hex to move.';
}
const mounted = () => G.mounts >= alive().length && alive().length>0;
const budget = () => mounted()?6:4;

// ---------- weather (§1) ----------
function rollWeather(){
  const h = hexAt(G.pos); const t = T('Daily weather');
  let v = roll('2d6'); if (G.weather && G.weather.band==='Excellent') v = Math.max(v, roll('2d6'));
  const row = t.rows.find(x=>+x[0]===v);
  let band = v<=4?'Stormy':v>=10?'Excellent':'Fair';
  const cl = climate(h.terr);
  const harsh = cl.harsh==='always' || (cl.harsh==='stormy' && band==='Stormy');
  if (band==='Stormy' && harsh) band='Severe';
  G.weather = {name:row[TERR[h.terr].col], band, harsh, climate:cl.name}; G.wdays = r(4);
  log(tag('Weather 2d6',v)+`<b>${G.weather.name}</b> — ${band}. ${cl.name} climate${harsh?' (<b>harsh</b>: double rations)':''}. Lasts ${G.wdays} day(s).`);
  if (band==='Severe'){ log(T('Weather bands').rows[3][1]); weatherEvent(); }
}
function weatherEvent(){
  const h = hexAt(G.pos); const c = climate(h.terr).name;
  const t = G.weather.band==='Stormy'||G.weather.band==='Severe' ? (/Hot|Scorch|Swelter/.test(c)?T('Hot'):T('Cold')) : T('Fair-weather events');
  const v = roll('2d6'); const row = pick(t,v);
  log(tag(t.cap,v)+`<b>${row[0]}.</b> ${row[1]}`);
  applyText(row[1]);
}
// light-touch reading of effect text: damage dice, saves, MC, rations
function applyText(txt){
  const save = (txt.match(/\b(STR|DEX|CON|INT|WIS|CHA)\b/)||[])[1];
  const dmg = (txt.match(/(\d+d\d+|\b1\b) damage|or (\d+d\d+)/)||[]);
  const amt = dmg[1]||dmg[2];
  if (amt && save){ for (const c of alive()){ const k=check(save==='INT'?c.int:0,12); if(!k.ok) hurt(c, roll(amt), save+' save failed'); } }
  else if (amt && /random character/.test(txt)) hurt(anyone(), roll(amt));
  if (/\+1 MC/.test(txt)){ G.mc+=1; log('The going is slower: +1 MC spent.'); }
  const sp = txt.match(/(\d+d\d+) rations spoil/); if (sp){ const n=Math.min(G.rations,roll(sp[1])); G.rations-=n; log(`${n} rations spoil.`,'bad'); }
  if (/Half the rations/.test(txt)){ const n=Math.ceil(G.rations/2); G.rations-=n; log(`${n} rations lost.`,'bad'); }
}

// ---------- move (§2) ----------
async function move(k){ try { return await move_(k); } catch(e){ console.error(e); (window.__errs=window.__errs||[]).push(e.stack); render(); } }
async function move_(k){
  if (G.over) return;
  if (G.weather && G.weather.band==='Severe'){ log('Severe weather: no travel today. Make camp.','bad'); return; }
  let [q,rr] = k.split(',').map(Number); let dest = {q,r:rr};
  const from = hexAt(G.pos);
  let h = hexAt(dest) && hexAt(dest).seen ? hexAt(dest) : null;
  const cost = t => G.weather.band==='Stormy' ? 2 : (TERR[t].mc);
  if (h && h.terr==='Sea / Lake'){ log('Open water. You need a boat for that.','bad'); return; }
  if (h && G.mc + cost(h.terr) > budget()){ log(`Not enough MC left today (${budget()-G.mc} left, ${h.terr} costs ${cost(h.terr)}). Make camp.`); return; }
  if (!h && G.mc >= budget()){ log('The day is spent. Make camp.'); return; }
  // navigation (§2.1)
  const roadway = from.road && G.road.has(k);
  if (!roadway){
    let dc = 12 + (G.weather.band==='Stormy'?3:0) + (G.buffs.haze?3:0);
    const nav = check(best(c=>c.int)+(G.buffs.favour?1:0), dc);
    log(tag('Navigation INT DC '+dc, nav.tot)+(nav.ok?'On course.':'<b class="bad">Lost the way.</b> '+T('Navigation').rows[1][2]));
    if (!nav.ok){ const n = nbrs(G.pos)[r(6)-1]; dest=n; k=key(n.q,n.r); }
  }
  h = hexAt(dest) || makeHex(dest);
  if (h.terr==='Sea / Lake'){ h.seen=true; log(`${TERR['Sea / Lake'].ic} The way ends at open water. You turn back.`); G.mc+=1; render(); return; }
  G.mc += cost(h.terr); G.pos = dest;
  const fresh = !h.seen; h.seen = true; G.foraged=false;
  log(`→ <b>${h.terr}</b>${h.road?' along the road':''}. (MC ${G.mc}/${budget()})`);
  if (h.feature==='Settlement' && h.band==='City' && dist(dest,G.goal)===0){ render(); return win(); }
  if (fresh){ await feature(h); await hexEvent(h); }
  checkDeath(); render();
}

// ---------- feature (§4) ----------
async function feature(h){
  if (h.feature) return;
  const v = roll('2d6'); const row = pick(T('Special feature'), v); let txt = h.road?row[0]:row[1];
  if (/^1–3 Dungeon/.test(txt)) txt = r(6)<=3?'Dungeon':'Catacombs';
  if (/^1–3 Catacombs/.test(txt)) txt = r(6)<=3?'Catacombs':'Cavern';
  let f = txt.split(/[.—]/)[0].trim();
  if (/Village/.test(f) && /Desert|Glacier/.test(h.terr)) f='Empty landscape';
  if (/Settlement/.test(txt)){ const b=r(6); h.band=b<=3?'Village':b<=5?'Town':'City'; f='Settlement'; h.fname = name().split(' ')[1]+(h.band==='City'?' City':h.band==='Town'?'ton':'by'); }
  if (/^Village/.test(f)){ f='Settlement'; h.band='Village'; h.fname=name().split(' ')[1]+'by'; }
  if (/Trading Post|Tavern/.test(f)){ h.band='Post'; h.fname=f; f='Settlement'; }
  h.feature=f;
  if (f!=='Empty landscape') log(tag('Special feature 2d6',v)+`<b>${h.fname?h.band+': '+h.fname:f}.</b> ${(T('What each feature is').rows.find(x=>f.startsWith(x[0]))||['',''])[1]}`);
}
async function exploreFeature(h){
  h.done = true; const f = h.feature;
  if (/Shrine/.test(f)){ const v=r(6), row=pick(T('Shrine'),v); log(tag('Shrine 1d6',v)+`<b>${row[0]}.</b> ${row[1]}`,'good'); if(/attack/.test(row[1]))G.buffs.atk=1; if(/AC/.test(row[1]))alive().forEach(c=>c.acB=1); return render(); }
  if (/Portal/.test(f)){ log('The portal hums. You step through…'); const d={q:G.pos.q+r(5)-2,r:G.pos.r+r(5)-2}; if(dist(d,G.goal)<dist(G.pos,G.goal)) log('…and come out closer to the City.','good'); G.pos=d; const hh=hexAt(d)||makeHex(d); if(hh.terr==='Sea / Lake')hh.terr='Grasslands'; hh.seen=true; return render(); }
  if (/Monastery|Keep/.test(f)){ log(`The ${f} gives you shelter. A safe night here; you may rest.`,'good'); G.safe=true; return render(); }
  // dungeon-like: a couple of fights and a hoard
  const rooms = 1 + r(3); log(`You delve into the ${f}: ${rooms} chambers.`);
  for (let i=0;i<rooms && alive().length;i++){
    if (r(6)<=3) await encounter(['VERMIN','MINIONS','MINIONS','WEIRD','BOSS'][Math.min(4,i+r(2)-1)], h, true);
    else { const v=r(100),row=pick(T('Treasure 0–3'),v); gainLoot(row[0], 'Treasure 0–3', v); }
  }
  if (alive().length){ const v=r(100), row=pick(T(G.party[0].lv>=4?'Treasure 4–6':'Treasure 0–3'),v); gainLoot(row[0],'Hoard',v); }
  checkDeath(); render();
}
function gainLoot(txt, tbl, v){
  let gp=0; const m = txt.match(/\((\d+) (gp|sp|cp)( each)?\)|(\d+) (gp|sp|cp)/);
  if (m){ const n=+(m[1]||m[4]), u=m[2]||m[5]; gp = u==='gp'?n:u==='sp'?n/10:n/100; const each=txt.match(/(Two|Pair|trio|five|Six|six)/i); if(m[3]&&each) gp*= ({two:2,pair:2,trio:3,five:5,six:6})[each[1].toLowerCase()]; }
  gp = Math.max(0, Math.round(gp));
  if (/^\d+ (gp|sp|cp)|in a|in the/.test(txt) && /(\d+) (gp|sp|cp) (in|on)/.test(txt)){ G.gold+=gp; log(tag(tbl,v)+`${txt} → <b>+${gp} gp</b>`,'good'); }
  else { G.loot.push({txt,gp}); log(tag(tbl,v)+`Found: <b>${txt}</b>`,'good'); }
  G.xp += gp>=50?3:gp>=10?1:0; levelUp();
}

// ---------- hex events (§5) ----------
async function hexEvent(h){
  const t = h.road ? T('Hex event — hex WITH') : T('Hex event — ROADLESS');
  const v = roll('3d6'); const row = pick(t, v); const txt=row[0];
  log(tag(h.road?'Hex event (road) 3d6':'Hex event (roadless) 3d6', v)+txt);
  if (/^Quiet/.test(txt)) return;
  if (/^Divine favour/.test(txt)) { G.buffs.favour=1; return; }
  if (/^Hidden chest/.test(txt)) { G.clues++; const tv=r(100); gainLoot(pick(T('Treasure 0–3'),tv)[0],'Treasure 0–3',tv); return; }
  if (/^Dragon/.test(txt)) { const dc=/Forest|Jungle|Swamp|Mountains/.test(h.terr)?12:15; const k=check(best(c=>c.dex+(c.cls==='Thief'?1:0)),dc); log(tag('DEX DC '+dc,k.tot)+(k.ok?'You hide; the shadow passes.':'<b>It stoops.</b> Fire washes the column.')); if(!k.ok) for(const c of alive()) hurt(c, roll('2d6'),'dragonfire'); return; }
  if (/^Extraordinary/.test(txt)) return encounter(r(6)<=3?'WEIRD':'BOSS',h);
  if (/^Weird/.test(txt)) return encounter('WEIRD',h);
  if (/^Weather/.test(txt)) { weatherEvent(); return; }
  if (/^Biome denizens/.test(txt)) return encounter('DENIZENS',h);
  if (/^NPC/.test(txt)) return npc();
  if (/^Vermin/.test(txt)) return encounter('VERMIN',h);
  if (/^Minions/.test(txt)) { const k=check(best(c=>c.dex+(c.cls==='Thief'?1:0)),12); if(k.ok){log(tag('DEX DC 12',k.tot)+'You slip past unseen.');return;} return encounter('MINIONS',h); }
  if (/^Imperial patrol/.test(txt)) { G.buffs.patrol=1; log('An imperial patrol rides with you while you hold the road.','good'); return hexEvent(h); }
  if (/^Cave entrance/.test(txt)) { h.feature = h.feature&&h.feature!=='Empty landscape'?h.feature:'Cave'; return; }
  if (/^Trouble/.test(txt)) return trouble();
  if (/^Ambush/.test(txt)) return encounter(whatAppears(),h,false,true);
  if (/^Wilderness hazard/.test(txt)) return hazard(h);
  if (/^Corpse/.test(txt)) { const d=r(6); log(tag('Corpse 1d6',d)+['','Disease: CON DC 12.','Nothing.','Nothing.','1d6 gp.','3d6 gp.','One potion.'][d]);
    if(d===1){const c=anyone(),k=check(0,12); if(!k.ok){c.con--; log(c.name+' sickens: −1 CON.','bad');}} if(d===4)G.gold+=r(6); if(d===5)G.gold+=roll('3d6'); if(d===6)G.loot.push({txt:'Healing potion',gp:25,potion:1}); }
}
function whatAppears(){ const v=roll('2d6'); const row=pick(T('What appears'),v); log(tag('What appears 2d6',v)+row[0]); return /Boss/.test(row[0])?'BOSS':/Minion/.test(row[0])?'MINIONS':/Vermin/.test(row[0])?'VERMIN':/Weird/.test(row[0])?'WEIRD':'DENIZENS'; }
function trouble(){
  const v=r(10), row=pick(T('Troubles'),v); log(tag('Trouble 1d10',v)+`<b>${row[0]}.</b> ${row[1]}`,'bad');
  if (v===4){ const n=nbrs(G.pos)[r(6)-1]; const h=hexAt(n)||makeHex(n); if(h.terr!=='Sea / Lake'){G.pos=n; h.seen=true;} G.mc++; }
  else if (v===5||v===6||v===8){ for(const c of (v===5?[anyone(),anyone()]:alive())){ if(c&&!check(0,12).ok){ c.con--; log(`${c.name}: −1 CON.`,'bad'); } } }
  else if (v===2){ const d=r(6); if(d<=2){G.mc=budget(); log('You must camp.');} else if(d<=4&&G.torches){G.torches--; log('A torch is lost to the wind.');} else G.mc++; }
  else applyText(row[1]);
}
async function hazard(h){
  const v=roll('2d6'), row=pick(T('Wilderness'),v); log(tag('Wilderness hazard 2d6',v)+`<b>${row[0]}.</b> ${row[1]}`);
  if (v===3) return trouble();
  if (v===2) return encounter('WEIRD',h);
  if (v===12){ return modal(`<h2>Toll taker</h2><p>${row[1]}</p>`, [['Pay 10 gp',()=>{G.gold=Math.max(0,G.gold-10);}],['Fight',()=>encounter('MINIONS',h)],['Slip past (DEX)',()=>{if(!check(1,12).ok){log('Spotted!','bad');return encounter('MINIONS',h);}log('You slip by.');}]]); }
  if (v===8){ const c=anyone(); if(!check(c.cls==='Thief'?2:0,12).ok) hurt(c,r(6),"hunter's trap"); }
  if (v===9){ const c=anyone(); if(!check(0,12).ok){ const n=Math.min(G.rations,r(4)); G.rations-=n; log(`${c.name} struggles free of the quicksand; ${n} rations lost.`,'bad'); } }
  if (v===6||v===4||v===7) G.mc++;
  if (v===10) G.mc=Math.max(0,G.mc-1);
}
function npc(){
  const v=r(20), row=pick(T('NPC encounter'),v);
  const rv = roll('2d6'); const re = pick(T('3. Reaction'), rv);
  log(tag('NPC 1d20',v)+`<b>${row[0]}.</b> ${row[1]} `+tag('Reaction',rv)+re[0]);
  if (/Horse trader/.test(row[0])) return modal(`<h2>Horse trader</h2><p>${row[1]}</p>`,[['Buy a mount (30 gp)',()=>{if(G.gold>=30){G.gold-=30;G.mounts++;}}],['Pass',()=>{}]]);
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
function rollFoe(type, h){
  const t = foeTable(type,h); const v = roll(t.die);
  const row = t.rows.find(x=>{const a=range(x.foe&&x.r);return a&&v>=a[0]&&v<=a[1];}) || t.rows[r(t.rows.length)-1];
  const b = row.b && BE.blocks[row.b];
  let no = Math.max(1, roll(row.no.replace(/[^0-9d+\-]/g,'')||'1'));
  const lv = b?b.lv:({VERMIN:1,MINIONS:2,DENIZENS:2,WEIRD:4,BOSS:6})[type];
  // keep it survivable for a small company: cap total levels
  const cap = Math.max(2, 4*avgLv()+2); while (no>1 && no*lv>cap) no--;
  const am = b && b.atk.match(/([+-]\d+)\s*\(([^)]*?\d*d\d+(?:\s*[+-]\s*\d+)?)/);
  return {name: b?b.name:row.foe, table:t.name, v, no, type,
    ac: b?b.ac:10+lv, hp: b?b.hp:4+lv*4, atk: am?+am[1]:lv+1, dmg: am?am[2].replace(/[^0-9d+\-]/g,''):'1d6', lv, b};
}
const avgLv = () => alive().reduce((a,c)=>a+c.lv,0)/Math.max(1,alive().length);

function encounter(type, h, inDungeon, ambush){
  return new Promise(res=>{ try {
    const f = rollFoe(type, h);
    const dist = pick(T('1. Distance'), r(6))[0], act = pick(T('2. Activity'), roll('2d6'));
    const rv = roll('2d6'); const re = pick(T('3. Reaction'), rv)[0];
    const hostile = ambush || type==='BOSS' || re==='Hostile' || (re==='Suspicious' && type!=='DENIZENS' && r(2)===1);
    const b=f.b;
    log(tag(f.table+' '+f.v, f.no+'×')+`<b>${f.name}</b> (${type.toLowerCase()}) — ${dist}, ${act?act[0].toLowerCase():''}. Reaction: ${re}.`);
    const html = `<h2>${f.no} × ${f.name}</h2><p><i>${type.toLowerCase()} · ${f.table}</i></p>${b&&b.desc?`<p>${b.desc}</p>`:''}
      ${b?`<div class="stat">${b.stat}</div>${b.traits.slice(0,3).map(x=>`<p style="font-size:13px">${x.replace(/\*\*(.*?)\*\*/g,'<b>$1</b>')}</p>`).join('')}`:''}
      <p>Range <b>${dist}</b>. ${ambush?'<b class="bad">Ambush! They strike first.</b>':`Reaction <b>${re}</b>${hostile?' — they mean violence.':'.'}`}</p>`;
    const done = () => { checkDeath(); render(); res(); };
    const opts = [['Fight', ()=>fight(f, ambush).then(done)]];
    if (!ambush) opts.push(['Flee', ()=>{ const k=check(best(c=>c.dex+(c.cls==='Thief'?1:0)),dist==='Close'?15:dist==='Near'?12:9); if(k.ok){log(tag('Flee',k.tot)+'You get clear.');G.mc++;done();} else {log(tag('Flee',k.tot)+'<b>They catch you.</b>','bad'); fight(f,true).then(done);} }]);
    if (!hostile) opts.push(['Let them be', ()=>{ log('You give them a wide berth.'); done(); }]);
    else if (!ambush && type!=='DENIZENS' && type!=='VERMIN') opts.push(['Pay them off (15 gp)', ()=>{ if(G.gold>=15 && r(6)>2){G.gold-=15; log('Coin changes hands. They let you go.');done();} else {log('They take nothing but blood.','bad'); fight(f,false).then(done);} }]);
    modal(html, opts);
  } catch(e){ (window.__errs=window.__errs||[]).push('ENC '+e.stack); res(); } });
}
async function fight(f, theyFirst){ try { return Promise.resolve(fight_(f, theyFirst)); } catch(e){ (window.__errs=window.__errs||[]).push('FIGHT '+e.stack); } }
function fight_(f, theyFirst){
  const foes = Array.from({length:f.no},()=>({hp:f.hp}));
  let round = 0, lines=[];
  const half = Math.ceil(f.no/2);
  while (alive().length && foes.some(x=>x.hp>0) && round<20){
    round++;
    const pturn = () => { for (const c of alive()){ const t=foes.find(x=>x.hp>0); if(!t)break;
      if (c.cls==='Priest' && c.heal!==G.day){ const w=alive().find(x=>x.hp<=x.max/3); if(w){ c.heal=G.day; const n=r(6)+1; w.hp=Math.min(w.max,w.hp+n); lines.push(`${c.name} heals ${w.name} (+${n}).`); continue; } }
      const a=r(20)+c.atk+(G.buffs.atk||0)+(G.buffs.favour||0)+(G.buffs.patrol?1:0);
      if (a>=f.ac || a-c.atk-(G.buffs.atk||0)>=20){ const d=roll(c.dmg)+(a-c.atk>=20?roll(c.dmg):0); t.hp-=d; lines.push(`${c.name} hits for ${d}${t.hp<=0?' — <b>it falls</b>':''}.`); } } };
    const fturn = () => { for (const x of foes) if (x.hp>0){ const c=anyone(); if(!c)break; const a=r(20)+f.atk; if(a>=c.ac+(c.acB||0)){ const d=Math.max(1,roll(f.dmg)); c.hp=Math.max(0,c.hp-d); lines.push(`<span class="bad">${f.name} hits ${c.name} for ${d}${c.hp<=0?' — <b>down</b>':''}.</span>`);} } };
    if (theyFirst && round===1){ fturn(); pturn(); } else { pturn(); fturn(); }
    const left = foes.filter(x=>x.hp>0).length;
    if (left && left<=half && f.type!=='BOSS' && !(f.b&&/Mindless|Immune to morale/.test(f.b.traits.join(' '))) && r(20)+Math.floor(f.lv/2)<11){ lines.push(`<b>Morale breaks.</b> The ${f.name} scatter.`); foes.forEach(x=>x.hp=0); }
  }
  log(`<details><summary>Combat, ${round} rounds</summary>${lines.join('<br>')}</details>`);
  if (alive().length && !foes.some(x=>x.hp>0)){
    const xp = f.lv*f.no; G.xp += xp; log(`Victory. +${xp} XP.`,'good');
    if (f.type!=='VERMIN' && f.type!=='DENIZENS' && r(6)>=3){ const tbl=f.lv>=7?'Treasure 7–9':f.lv>=4?'Treasure 4–6':'Treasure 0–3'; const v=r(100); gainLoot(pick(T(tbl),v)[0],tbl,v); }
    if (f.type==='DENIZENS' && r(2)===1){ const n=r(4); G.rations+=n; log(`You butcher the kill: +${n} rations.`,'good'); }
    levelUp();
  }
}
function levelUp(){
  for (const c of alive()){ if (c.lv<10 && G.xp >= 25*c.lv*(c.lv+1)/2){ c.lv++; const g=Math.max(1,r(HD[c.cls]||6)+mod(c.stats?c.stats.CON:10)); c.max+=g; c.hp+=g; if(c.lv%2) c.atk++; log(`⭐ <b>${c.name}</b> reaches level ${c.lv} (+${g} HP).`,'good'); } }
}

// ---------- forage (§8.2) & camp (§8) ----------
function forage(){
  const h = hexAt(G.pos); const row = T('Forage, hunt or fish').rows.find(x=>x[0]===h.terr) || T('Forage, hunt or fish').rows[0];
  G.foraged = true; let got = 0;
  for (const c of alive()){
    const dc = G.weather.harsh ? 18 : +row[2]||15; const k = check(c.int + (G.buffs.bloom?3:0), dc);
    if (k.ok){ const v=roll('2d6'), w=pick(T('What the hunt brings'),v); got += +w[0]; log(tag(`${c.name} hunts DC ${dc}`,k.tot)+`${w[1]} (+${w[0]})`,'good'); if(v===12) { G.rations+=got; got=0; encounter(whatAppears(),h); } }
    else { const m=r(10), mr=pick(T('Mishaps'),m); log(tag(`${c.name} hunts DC ${dc}`,k.tot)+'Nothing. '+(m>4?mr[1]:'')); if(/1 damage/.test(mr[1])&&m>4) hurt(c,1); }
  }
  G.rations += got; G.mc = Math.min(budget(), G.mc+2); log(`Foraging takes half the day (MC +2). +${got} rations.`); render();
}
async function camp(){ try { return await camp_(); } catch(e){ console.error(e); (window.__errs=window.__errs||[]).push(e.stack); render(); } }
async function camp_(){
  const h = hexAt(G.pos);
  log(`Camp in the ${h.terr.toLowerCase()}.`);
  // daytime encounter checks (2 × 1-in-6) for the half-days just travelled
  for (let i=0;i<2;i++) if (r(6)===1 && alive().length){ log(tag('Encounter check','1')+'Something finds you on the road.'); await encounter(whatAppears(),h); }
  // rations
  if (!G.weather) rollWeather();
  const mult = G.weather.harsh ? 2 : 1;
  const need = (alive().length + G.mounts) * mult;
  if (G.rations >= need){ G.rations -= need; log(`The company eats ${need} rations${mult>1?' (harsh climate)':''}.`); }
  else { log(`<b>Short of food.</b> ${T('Going hungry').rows[1][1]}`,'bad'); G.rations=0; for (const c of alive()) c.con--; if (G.mounts && r(3)===1){ G.mounts--; G.rations+=4; log('A mount dies; you eat it. +4 rations.','bad'); } }
  // fire
  let fire = G.torches>=3 && !(G.weather.band==='Severe'); if (fire){ G.torches-=3; log('A fire burns through the night (3 torches).'); } else log('No fire tonight.','bad');
  // overnight checks
  let interrupted = false;
  for (let i=0;i<2;i++) if (r(6)<=(fire?1:2) && alive().length && !G.safe){ interrupted=true; log(tag('Night check','!')+'Something comes in the dark.'); await encounter(whatAppears(),h, false, r(2)===1); }
  // rest
  const canRest = (G.weather.band!=='Stormy' && G.weather.band!=='Severe') || G.safe;
  for (const c of alive()){
    if (canRest && (!interrupted || check(0,12).ok)){ c.hp=c.max; if (G.rations>0||!interrupted) c.con=Math.min(c.conMax, c.con+ (mult===1?c.conMax:1)); }
    else c.hp = Math.min(c.max, c.hp+1);
  }
  log(canRest ? 'You rest and recover.' : '<span class="bad">No real rest in this weather.</span>');
  // potions on the dying
  for (const c of G.party) if (c.hp<=0 && c.con>0){ const p=G.loot.findIndex(x=>x.potion); if(p>=0){G.loot.splice(p,1); c.hp=c.max; log(`A potion brings ${c.name} back from the brink.`,'good');} else if (r(20)>=18){ c.hp=1; log(`${c.name} wakes, somehow.`,'good'); } else { c.con=0; log(`<b>${c.name} does not wake.</b>`,'bad'); } }
  newDay(); checkDeath(); render();
}
function newDay(){
  G.day++; G.mc=0; G.safe=false; G.foraged=false; G.buffs={}; G.party.forEach(c=>c.acB=0);
  if (G.day % 30 === 0){ G.season=(G.season+1)%4; log(`<b>${SEASONS[G.season]} comes.</b>`); }
  log(`Day ${G.day}`, 'day');
  if (--G.wdays <= 0) rollWeather(); else log(`Still ${G.weather.name.toLowerCase()} (${G.weather.band}).`);
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
    ['Healing potion', p(30), ()=>G.loot.push({txt:'Healing potion',gp:15,potion:1})],
  ];
  const draw = () => {
    const html = `<h2>${first?'Startown market':(h.fname||'Settlement')+' · '+h.band}</h2>
     <p>${first?'Outfit your company before the road. Mounts double your daily movement (6 MC instead of 4), but each eats a ration a day.':T('Prices').rows.find(x=>x[0]===h.band)?.slice(1).join(' · ')||''}</p>
     <p>💰 <b>${G.gold} gp</b> · 🍖 ${G.rations} · 🔥 ${G.torches} · 🐎 ${G.mounts} · 🎒 loot worth ${loot} gp</p>`;
    const opts = items.map(([n,c,f])=>[`${n} — ${c} gp`, ()=>{ if(G.gold>=c){G.gold-=c;f();} draw(); }, true]);
    if (!first){
      opts.push([`Sell loot (half value)`, ()=>{ let s=0; G.loot=G.loot.filter(x=>{ if(x.potion) return true; if(Math.random()<buyer){s+=Math.floor(x.gp/2);return false;} return true;}); G.gold+=s; log(`Sold loot for ${s} gp.`,'good'); draw(); }, true]);
      opts.push(['Inn: rest the night (2 gp each)', ()=>{ const c=2*alive().length; if(G.gold>=c){G.gold-=c; G.safe=true; G.party.forEach(x=>{if(x.con>0){x.hp=x.max;x.con=x.conMax;}}); G.weather={...G.weather,band:'Fair',harsh:false}; closeModal(); log('A roof, a bed, a hot meal. Everyone recovers fully.','good'); newDay(); render();} }]);
      opts.push(['Ask for news (1 gp)', ()=>{ if(G.gold<1)return; G.gold--; const v=r(20), row=pick(T('Settlement events'),v); log(tag('Settlement event 1d20',v)+`<b>${row[0]}.</b> ${row[1]}`); draw(); }, true]);
      if (alive().length<4 && h.band!=='Post') opts.push(['Hire a sellsword (25 gp)', ()=>{ if(G.gold>=25){G.gold-=25; const h=randomChar('Fighter'); h.gold=0; h.name+=' (sellsword)'; G.party.push(h); log('A sellsword joins the company.','good');} draw(); }, true]);
    }
    opts.push([first?'Set out':'Leave', ()=>{ closeModal(); if(first){ log('Day 1','day'); rollWeather(); } render(); }]);
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
function closeModal(){ $("#modal").hidden=true; (window.__cm=window.__cm||[]).push(new Error().stack.split("\n").slice(1,4).join(" < ")); if(window.__cm.length>5)window.__cm.shift(); }

// ---------- end ----------
function checkDeath(){
  for (const c of G.party) if (c.con<=0 && !c.dead){ c.dead=true; c.hp=0; log(`<b>${c.name} the ${c.cls} is dead.</b>`,'bad'); }
  if (!G.over && !alive().length && $('#modal').hidden!==false){ G.over=true; modal(`<h2>The wilds keep you</h2><p>The company is lost on day ${G.day}, ${dist(G.pos,G.goal)} hexes short of the City.</p>`,[['Again',newGame]]); }
}
function win(){
  G.over=true; const score = G.gold + G.loot.reduce((a,b)=>a+b.gp,0) + G.xp*5 + alive().length*50 - G.day*5;
  modal(`<h2>The City at last</h2><p>Day ${G.day}. ${alive().length} of the company walk through the gate: ${alive().map(c=>c.name).join(', ')}.</p><p>Gold ${G.gold} · loot ${G.loot.reduce((a,b)=>a+b.gp,0)} gp · XP ${G.xp}</p><p><b>Score ${score}</b></p>`,[['New journey',newGame]]);
}
window.addEventListener('resize', ()=>G&&render());
newGame();
})();
