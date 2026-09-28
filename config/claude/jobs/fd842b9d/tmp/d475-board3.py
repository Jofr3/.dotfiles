best=None
# P1 Active: f1 Fire basics + 1 fix-grassdouble (1 card, 2 units)
# P2 Active: f2 Fire basics + w2 Water basics
for f1 in range(1,4):
 for f2 in range(1,6):
  for w2 in range(1,6):
   a1=f1+1; u1=f1+2
   a2=f2+w2; u2=a2
   for b1 in range(0,7):
    for b2 in range(0,10):
     for n1 in range(0,6):
      for n2 in range(0,6):
       if (b1>0 and n1==0) or (b2>0 and n2==0): continue
       if b1>n1*3 or b2>n2*3: continue
       r={'correct':a1+a2,'units':u1+u2,'self':a1,'foe':a2,'typedFire':f1+f2,
          'boardSelf':a1+b1,'boardFoe':a2+b2,'boardBoth':a1+a2+b1+b2,
          'bodiesSelf':1+n1,'bodiesFoe':1+n2,'bodiesBoth':2+n1+n2}
       v=list(r.values())
       if len(set(v))!=len(v): continue
       if r['correct']<5: continue
       score=(max(v), a1+a2+b1+b2+n1+n2)
       if best is None or score<best[0]:
         best=(score,dict(r),{'f1':f1,'f2':f2,'w2':w2,'a1':a1,'a2':a2,'b1':b1,'n1':n1,'b2':b2,'n2':n2})
print(best)
