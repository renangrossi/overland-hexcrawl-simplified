// Book page roller: adds a 🎲 button to every table whose rows start with a die result.
// The die comes from the table's own header (2d6, d100, 1d20…); only when the header has none is it inferred.
(function(){
function rng(t){ t=t.replace(/[–—]/g,'-').trim(); const m=t.match(/^(\d+)\s*(?:-\s*(\d+)|(\+))?$/); if(!m) return null;
  const v=x=>x==='00'?100:+x; return [v(m[1]), m[3]?Infinity:(m[2]!==undefined?v(m[2]):v(m[1]))]; }
// "3–4, 6–8, 10–11" → several ranges
function ranges(t){ const out=t.split(',').map(rng); return out.every(Boolean)?out:null; }
const r=n=>1+Math.floor(Math.random()*n);
function parseDie(s){ const m=(s||'').match(/(\d*)d(\d+)/i); if(!m) return null; const n=+m[1]||1, f=+m[2];
  return {n:`${n>1?n:''}d${f}`, roll:()=>{let t=0;for(let i=0;i<n;i++)t+=r(f);return t;}}; }
function infer(lo,hi){
  if (hi>20 && hi<=100) return parseDie('d100');
  if (lo===3 && hi===18) return parseDie('3d6');
  if (lo===2 && hi===12) return parseDie('2d6');
  if (lo===4 && hi===24) return parseDie('4d6');
  const s=[4,6,8,10,12,20].find(d=>d>=hi)||hi; return parseDie('d'+s);
}
document.querySelectorAll('table').forEach(tb=>{
  // every td.d cell is a key; side-by-side tables carry two per row
  const keys=[];
  tb.querySelectorAll('tbody tr').forEach(tr=>tr.querySelectorAll('td.d').forEach(td=>{ const rs=ranges(td.textContent); if(rs) keys.push({tr,td,rs}); }));
  if (keys.length<2) return;
  const th = tb.querySelector('thead th.d') || tb.querySelector('thead th');
  const cap = tb.querySelector('caption');
  const headDie = th && /^\s*\d*d\d+\s*$/i.test(th.textContent) ? th.textContent.trim() : null;
  const capDie = cap && (cap.querySelector('.die')||{}).textContent;
  const all = keys.flatMap(k=>k.rs); const lo=Math.min(...all.map(x=>x[0])), hi=Math.max(...all.map(x=>x[1]===Infinity?x[0]:x[1]));
  const d = parseDie(headDie) || (capDie && /^\s*\d*d\d+\s*(\+|$)/.test(capDie) && parseDie(capDie)) || infer(lo,hi);
  const bonus = capDie && /\+\s*bonus/.test(capDie);
  const btn=document.createElement('button'); btn.className='rollbtn'; btn.textContent='🎲 '+d.n+(bonus?'+bonus':'');
  const out=document.createElement('span'); out.className='rollout';
  btn.onclick=e=>{ e.preventDefault(); let v=d.roll(); let note='';
    if (bonus){ const b=+(prompt('Bonus to add?','0')||0); v+=b; note=` (${v-b}${b>=0?'+':''}${b})`; }
    tb.querySelectorAll('.hit').forEach(x=>x.classList.remove('hit'));
    // clamp to the table's ends: below the lowest row reads the lowest, above the highest reads the highest
    const vv=Math.max(lo,Math.min(v, Math.max(...all.map(x=>x[1]))));
    const k=keys.find(k=>k.rs.some(([a,b])=>vv>=a&&vv<=b));
    if (k){ k.td.classList.add('hit'); let n=k.td.nextElementSibling; while(n && !n.classList.contains('d')){ n.classList.add('hit'); n=n.nextElementSibling; } }
    out.textContent=' → '+v+note+(k?'':' (no row)');
  };
  const host=cap||tb; host.insertBefore(out,host.firstChild); host.insertBefore(btn,out);
});
const tray=document.createElement('div'); tray.id='tray';
const res=document.createElement('b');
[4,6,8,10,12,20,100].forEach(s=>{ const b=document.createElement('button'); b.textContent='d'+s; b.onclick=()=>res.textContent='d'+s+': '+r(s); tray.appendChild(b); });
tray.appendChild(res); document.body.appendChild(tray);
})();
