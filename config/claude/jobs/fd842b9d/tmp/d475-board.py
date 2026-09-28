import itertools
best=None
for a1 in range(1,5):
 for a2 in range(0,7):
  for f1 in range(0,a1+1):
   for f2 in range(0,a2+1):
    for b1 in range(0,7):
     for b2 in range(0,9):
      for n1 in range(0,6):
       for n2 in range(0,6):
        if b1>0 and n1==0: continue
        if b2>0 and n2==0: continue
        if b1> n1*3 or b2> n2*3: continue
        r={
         'correct':a1+a2,'self':a1,'foe':a2,'typed':f1+f2,
         'boardSelf':a1+b1,'boardFoe':a2+b2,'boardBoth':a1+a2+b1+b2,
         'bodiesSelf':1+n1,'bodiesFoe':1+n2,'bodiesBoth':2+n1+n2}
        v=list(r.values())
        if len(set(v))!=len(v): continue
        if r['correct']<4: continue
        score=(max(v), a1+a2+b1+b2+n1+n2)
        if best is None or score<best[0]:
          best=(score,dict(r),(a1,f1,a2,f2,b1,n1,b2,n2))
print(best)
