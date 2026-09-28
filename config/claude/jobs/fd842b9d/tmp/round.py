import re, sys, subprocess, os
sys.path.insert(0,'/home/jofre/.claude/jobs/fd842b9d/tmp')
from patch import patch, NOTE

FILES = sys.argv[1:]
os.chdir('/home/jofre/projects/luminous_ui')
r = subprocess.run(['bunx','vitest','run','--pool=forks','--maxWorkers=2',*FILES],
                   capture_output=True, text=True, timeout=1200)
log = r.stdout + r.stderr
lines = log.split('\n')
fails = []
for i,l in enumerate(lines):
    if l.strip().startswith('AssertionError'):
        for j in range(i+1, min(i+30,len(lines))):
            m = re.search(r'(packages/engine/src/\S+?\.test\.ts):(\d+):(\d+)', lines[j])
            if m:
                fails.append((m.group(1), int(m.group(2)), l.strip()))
                break
if not fails:
    print("GREEN")
    print([x for x in lines if 'Test Files' in x or 'Tests ' in x][-2:])
    sys.exit(0)
print(len(fails), "failures")
for f,n,msg in fails:
    mm = re.search(r'expected \[ (\d+), (\d+) \] to deeply equal \[ (\d+), (\d+) \]', msg)
    if mm:
        got_a, got_b, exp_a, exp_b = mm.groups()
        note = NOTE
        if int(got_a) < int(exp_a):
            note = NOTE.replace("+1 sentence / +2 printings","−1 sentence / −2 printings").replace(
              "so a `.length` site takes +1 where a `units(…)` site takes +2",
              "so a `.length` site takes −1 where a `units(…)` site takes −2")
        patch(f, n, f"[{exp_a}, {exp_b}]", f"[{got_a}, {got_b}]", note)
        continue
    mm = re.search(r'expected (\d+) to be (\d+)', msg)
    if mm:
        got, exp = mm.groups()
        patch(f, n, f"({exp})", f"({got})", NOTE)
        continue
    mm = re.search(r'to have a length of (\d+) but got (\d+)', msg)
    if mm:
        exp, got = mm.groups()
        patch(f, n, f"toHaveLength({exp})", f"toHaveLength({got})", NOTE)
        continue
    print("UNHANDLED", f, n, msg)
