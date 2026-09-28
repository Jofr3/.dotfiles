import io,json,re,subprocess,shutil,os
MUT='/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts'
s=io.open(MUT,encoding='utf-8').read()
rows=[]
for m in re.finditer(r'\{\n    id: "(D519-[^"]+)",\n    decision: "D519",\n(.*?)\n  \},\n', s, re.S):
    body=m.group(2)
    f=re.search(r'\n    file: (".*?"),\n', body).group(1)
    fi=re.search(r'\n    find: (".*(?:\\"|[^"])*?"),\n    replace:', body)
    find=re.search(r'\n    find: (".*?"),\n    replace: (".*?"),\n', body, re.S)
    rows.append((m.group(1), json.loads(f), json.loads(find.group(1)), json.loads(find.group(2))))
print("rows", len(rows))
base=subprocess.run(['bun','/home/jofre/.claude/jobs/fd842b9d/tmp/visib.ts'],capture_output=True,text=True,cwd='/home/jofre/projects/luminous_ui')
BASE=json.loads(base.stdout.strip())
print("BASE reader:", BASE)
for rid,f,find,repl in rows:
    p='/home/jofre/projects/luminous_ui/'+f
    orig=io.open(p,encoding='utf-8').read()
    assert orig.count(find)==1, rid
    io.open(p,'w',encoding='utf-8').write(orig.replace(find,repl,1))
    try:
        r=subprocess.run(['bun','/home/jofre/.claude/jobs/fd842b9d/tmp/visib.ts'],capture_output=True,text=True,cwd='/home/jofre/projects/luminous_ui')
        out=r.stdout.strip()
        v=json.loads(out) if out.startswith('[') else out[:120]
    finally:
        io.open(p,'w',encoding='utf-8').write(orig)
    print(f"{rid:56} {v}  {'MOVED' if v!=BASE else 'silent'}")
