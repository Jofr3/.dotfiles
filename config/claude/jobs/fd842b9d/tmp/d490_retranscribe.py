import io, json, sys
P = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts"
s = io.open(P, encoding="utf-8").read()

def swap(old, new, n=1):
    global s
    if s.count(old) != n:
        sys.stderr.write("COUNT %d for %s\n" % (s.count(old), old[:120])); raise SystemExit(2)
    s = new.join(s.split(old))

# ── D403 ×2 — the assembler's bench arm is now inside a `switch` case, so every line is
#    four spaces deeper. Re-transcribed onto the SAME lines at their new indentation
#    (D446: shorten onto the line the row is about; the mutation is byte-identical in
#    meaning).
swap('    find: "      from: \\"yourBench\\",\\n      filter: reading.filter,",\n    replace: "      from: \\"yours\\",\\n      filter: reading.filter,",',
     '    find: "          from: \\"yourBench\\",\\n          filter: reading.filter,",\n    replace: "          from: \\"yours\\",\\n          filter: reading.filter,",')
swap('    find: "      count: \\"any\\",\\n      cap: reading.cap,\\n      recordAs: \\"discarded\\",",\n    replace: "      count: \\"any\\",\\n      recordAs: \\"discarded\\",",',
     '    find: "          count: \\"any\\",\\n          cap: reading.cap,\\n          recordAs: \\"discarded\\",",\n    replace: "          count: \\"any\\",\\n          recordAs: \\"discarded\\",",')

# ── D455-the-mill-crosses-the-table — the TERNARY it quoted is gone; D490 replaced it with
#    a `switch` (D447: a total switch is the only thing that sees a new union member). The
#    row's CLAIM is unchanged — the mill lands on the wrong deck — and is re-transcribed by
#    swapping the two shipped cases.
swap('    find: "      const victim = op.whose === \\"self\\" ? ctx.seat : otherSeat(ctx.seat);\\n      const side = state.players[victim];",\n    replace: "      const victim = op.whose === \\"self\\" ? otherSeat(ctx.seat) : ctx.seat;\\n      const side = state.players[victim];",',
     '    find: "          case \\"self\\":\\n            return [ctx.seat];\\n          case \\"opponent\\":\\n            return [otherSeat(ctx.seat)];",\n    replace: "          case \\"self\\":\\n            return [otherSeat(ctx.seat)];\\n          case \\"opponent\\":\\n            return [ctx.seat];",')

# ── D455-the-mill-announces-an-empty-deck — the zero guard is now a `continue` inside the
#    walk and the filing has moved out of it. Same claim, same mutation: delete the guard
#    and the op announces a deck it did not touch.
swap('    find: "      const milled = side.deck.slice(0, Math.max(0, op.count));\\n      if (milled.length === 0) {\\n        recordMoved(record, op.recordAs, []);\\n        return { done: state };\\n      }",\n    replace: "      const milled = side.deck.slice(0, Math.max(0, op.count));",',
     '    find: "        const milled = side.deck.slice(0, Math.max(0, op.count));\\n        if (milled.length === 0) continue;",\n    replace: "        const milled = side.deck.slice(0, Math.max(0, op.count));",')

# ── D488-mill-does-not-record — the filing is now one call after the walk, over the
#    accumulated list. Same claim.
swap('    find: "      recordMoved(record, op.recordAs, milled);",\n    replace: "",',
     '    find: "      recordMoved(record, op.recordAs, filed);\\n      return { done: milledState };",\n    replace: "      return { done: milledState };",')

# ── D488-empty-answer-is-not-filed — the early-return path it quoted no longer exists;
#    the filing is UNCONDITIONAL after the walk. The same defect is now spelled by gating
#    it on a non-empty answer, and the killer set is unchanged.
swap('    find: "      if (milled.length === 0) {\\n        recordMoved(record, op.recordAs, []);\\n        return { done: state };\\n      }",\n    replace: "      if (milled.length === 0) return { done: state };",',
     '    find: "      recordMoved(record, op.recordAs, filed);",\n    replace: "      if (filed.length > 0) recordMoved(record, op.recordAs, filed);",')

open(P, "wb").write(s.encode("utf-8"))
print("re-transcribed 6 rows")
