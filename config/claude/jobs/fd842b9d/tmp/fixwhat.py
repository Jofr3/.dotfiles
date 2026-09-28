import json
p = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts"
backup = open(p, encoding="utf-8").read()
OLD_TAIL = ("Every end-state assertion in §3 stays GREEN under it. "
            "Two things redden: §2's derived-VALUE rung, and §4's ZERO-MATCH board, where the real build ends "
            "silently on a four-body Bench and this one parks a prompt and swaps the Active.")
NEW_TAIL = ("⚠️ **THE KILLER SET IS MEASURED, NOT ASSERTED** (D440's attribution control, D464's "
            "\"ask which assertion caught it\"): the mutation was applied by hand and each candidate run "
            "ALONE. FOUR independent killers — §2's derived-VALUE rung (3 failed), §3's parked "
            "candidate list (2 failed), §4's ZERO-MATCH board (3 failed, where the real build ends silently "
            "on a four-body Bench and this one parks a prompt and swaps the Active) and "
            "`switchSeam.test.ts`'s re-pointed rung (1 failed). 🛑 **AND THE MEASUREMENT CORRECTED THE "
            "FIRST DRAFT OF THIS SENTENCE**, which claimed §3 stayed green: §3 reads the PROMPT, not the "
            "end state, so it sees the widened candidate list immediately. The end-state half of the claim is "
            "the one that holds — §3's promotion rung and the §8.5 damage assertions pass under both "
            "builds — and it is §4 that carries it.")
assert backup.count(OLD_TAIL.replace("§", "§")) or True
# The `what` is stored JSON-escaped; rebuild by locating the escaped form.
esc_old = json.dumps(OLD_TAIL, ensure_ascii=False)[1:-1]
n = backup.count(esc_old)
assert n == 1, "old tail occurs %dx" % n
esc_new = json.dumps(NEW_TAIL, ensure_ascii=False)[1:-1]
out = backup.replace(esc_old, esc_new, 1)
assert out != backup
try:
    open(p, "wb").write(out.encode("utf-8"))
    print("mutants.ts `what` corrected: %d -> %d bytes" % (len(backup), len(out)))
except Exception as e:
    open(p, "wb").write(backup.encode("utf-8"))
    print("RESTORED after", e); raise
