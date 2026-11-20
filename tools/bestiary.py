import re,json,glob,sys
src=sys.argv[1];tabs=[];blocks={}
def norm(s):
  w=re.sub(r'[^a-z ]','',s.lower()).split()
  return ' '.join(re.sub(r'(ves)$','f',re.sub(r'(ies)$','y',re.sub(r'(?<=[^s])s$','',re.sub(r'(ches|shes|sses|xes)$',lambda m:m.group(1)[:-2],x)))) for x in w)
for f in sorted(glob.glob(src+'/*.md')):
  if re.search(r'/(4\d|5\d)-',f): continue
  L=open(f).read().split('\n');i=0
  while i<len(L):
    l=L[i]
    m=re.match(r'### (.*?) — (VERMIN|MINIONS?|WEIRD(?: MONSTER)?|BOSS|DENIZENS)\s*\(([^)]*)\)(.*)',l)
    if m:
      terr=[t.strip() for t in m.group(4).split('·')[2:]] if m.group(4).count('·')>=2 else []
      rows=[];i+=1
      while i<len(L) and not L[i].startswith('#'):
        c=[x.strip() for x in L[i].strip('|').split('|')]
        if L[i].startswith('|') and len(c)>=3 and re.match(r'[\d–-]+$',c[0]): rows.append(dict(r=c[0],foe=c[1],no=c[-1]))
        i+=1
      tabs.append(dict(name=m.group(1),type={'VERMIN':'VERMIN','MINION':'MINIONS','MINIONS':'MINIONS','WEIRD':'WEIRD','WEIRD MONSTER':'WEIRD','BOSS':'BOSS','DENIZENS':'DENIZENS'}[m.group(2)],die=m.group(3),terr=terr,rows=rows,file=f.split('/')[-1]));continue
    m=re.match(r'#### (.+)',l)
    if m and i+3<len(L):
      nm=m.group(1).strip();desc=[];j=i+1
      while j<len(L) and not L[j].startswith('AC '): 
        if L[j].startswith('#'): break
        desc.append(L[j]);j+=1
      if j<len(L) and L[j].startswith('AC '):
        st=L[j];tr=[];k=j+1
        while k<len(L) and L[k].strip() and not L[k].startswith('#'): tr.append(L[k]);k+=1
        g=lambda p:(re.search(p,st) or [None,''])[1]
        blocks.setdefault(norm(nm),dict(name=nm.title(),desc=' '.join(desc).strip(),ac=int(g(r'AC (\d+)') or 10),hp=int(g(r'HP (\d+)') or 4),atk=g(r'ATK (.*?), MV'),lv=int(g(r'LV (\d+)') or 1),stat=st,traits=tr))
        i=k;continue
    i+=1
miss=0
for t in tabs:
  for r in t['rows']:
    k=norm(r['foe']);b=blocks.get(k) or next((v for kk,v in blocks.items() if kk.startswith(k) or k.startswith(kk)),None)
    r['b']=k if k in blocks else (norm(b['name']) if b else None)
    if not b: miss+=1
json.dump(dict(tables=tabs,blocks=blocks),open(sys.argv[2],'w'),ensure_ascii=False)
print(len(tabs),'tables',len(blocks),'blocks',miss,'unmatched')
