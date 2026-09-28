import io,os,re
NEEDLES=[
 ("the printed sentence", "for each of your Pokémon that has any damage counters on it"),
 ("the new anchor name", "IN_PLAY_DAMAGED_BODY_MULTIPLY"),
 ("CardFilter-damage refusal prose", r"CardFilter[^.\n]{0,120}damag"),
 ("damaged-body member", "damaged-body member"),
 ("unread count source", "count source with no reader"),
 ("row 596 / FILE LINE 596", r"(?:row|LINE) 596"),
]
roots=['packages','scripts','docs']
for label,pat in NEEDLES:
    rx=re.compile(pat)
    print("══",label)
    n=0
    for root in roots:
        for dp,dn,fn in os.walk(root):
            if 'node_modules' in dp: continue
            for f in fn:
                if not f.endswith(('.ts','.tsx','.md')): continue
                p=os.path.join(dp,f)
                try: txt=io.open(p,encoding='utf-8').read()
                except Exception: continue
                for i,l in enumerate(txt.split('\n'),1):
                    if rx.search(l):
                        n+=1
                        if len(l)<400 or 'docs/' not in p:
                            print(f"   {p}:{i}  {l.strip()[:150]}")
    print("   total lines:", n)
