import re,html,json,sys
h=open(sys.argv[1]).read()
h=h[h.find('The Travel Day'):]
def txt(s): return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',s))).strip()
out=[];sec=''
for m in re.finditer(r'<h[34][^>]*>(.*?)</h[34]>|<table[^>]*>(.*?)</table>',h,re.S):
  if m.group(1): sec=txt(m.group(1));continue
  t=m.group(2);cap=re.search(r'<caption>(.*?)</caption>',t,re.S)
  capt=re.sub(r'<span class="(note|die)">.*?</span>','',cap.group(1),flags=re.S) if cap else ''
  die=re.search(r'<span class="die">(.*?)</span>',cap.group(1)) if cap else None
  head=[txt(x) for x in re.findall(r'<th[^>]*>(.*?)</th>',t,re.S)]
  rows=[[txt(c) for c in re.findall(r'<td[^>]*>(.*?)</td>',r,re.S)] for r in re.findall(r'<tr>(.*?)</tr>',re.sub(r'<thead>.*?</thead>','',t,flags=re.S),re.S)]
  out.append(dict(sec=sec,cap=txt(capt),die=txt(die.group(1)) if die else '',head=head,rows=[r for r in rows if r]))
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=0)
print(len(out))
