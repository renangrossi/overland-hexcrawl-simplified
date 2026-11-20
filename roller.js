(function(){
function parse(t){t=t.replace(/[–—]/g,'-').trim();var m=t.match(/^(\d+)\s*(?:-\s*(\d+)|(\+))?$/);if(!m)return null;var a=+m[1];if(m[1]==='00')a=100;var b=m[3]?999:m[2]!==undefined?(m[2]==='00'?100:+m[2]):a;return[a,b];}
function r(n){return 1+Math.floor(Math.random()*n);}
function dice(lo,hi,cap){var c=(cap.match(/(\d*)d(\d+)/)||[]);
 if(hi>20)return{n:'d100',f:function(){return r(100)}};
 if(lo>=2&&hi<=12&&lo<=3)return{n:'2d6',f:function(){return r(6)+r(6)}};
 if(lo>=3&&hi<=18&&lo<=4&&hi>12)return{n:'3d6',f:function(){return r(6)+r(6)+r(6)}};
 var s=[4,6,8,10,12,20].find(function(d){return d>=hi})||hi;return{n:'d'+s,f:function(){return r(s)}};}
document.querySelectorAll('table').forEach(function(tb){
 var rows=[].slice.call(tb.querySelectorAll('tbody tr')).map(function(tr){var c=tr.querySelector('td.d');var p=c&&parse(c.textContent);return p?{tr:tr,p:p}:null}).filter(Boolean);
 if(rows.length<2)return;
 var lo=Math.min.apply(0,rows.map(x=>x.p[0])),hi=Math.max.apply(0,rows.map(x=>x.p[1]===999?x.p[0]:x.p[1]));
 var cap=tb.querySelector('caption');var d=dice(lo,hi,cap?cap.textContent:'');
 var btn=document.createElement('button');btn.className='rollbtn';btn.textContent='🎲 '+d.n;
 var out=document.createElement('span');out.className='rollout';
 btn.onclick=function(e){e.preventDefault();var v=d.f();rows.forEach(x=>x.tr.classList.remove('hit'));
  var h=rows.find(x=>v>=x.p[0]&&v<=x.p[1]);if(h){h.tr.classList.add('hit');}out.textContent=' → '+v;};
 (cap||tb).insertBefore(out,(cap||tb).firstChild);(cap||tb).insertBefore(btn,out);
});
var tray=document.createElement('div');tray.id='tray';
[4,6,8,10,12,20,100].forEach(function(s){var b=document.createElement('button');b.textContent='d'+s;b.onclick=function(){res.textContent='d'+s+': '+r(s)};tray.appendChild(b)});
var res=document.createElement('b');tray.appendChild(res);document.body.appendChild(tray);
})();
