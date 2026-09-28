import io, sys

NOTE = ("(\U0001F195\U0001F195\U0001F195 **D500 +1 sentence / +1 printing — THE PRINTED CARD CATEGORY `Basic`, "
        "WHICH IS `Special`'s COMPLEMENT AND NOT A TENTH TYPE** — `censusAttackCorpus.ts` **FILE LINE 580**, "
        "*\"This attack does 40 damage for each Basic Energy attached to this Pokémon.\"*, "
        "**1 sentence / 1 legal printing**, claimed by `deriveAttackDamageMultiplier` through **ONE ROW in "
        "`CLAUSE_ENERGY_TOKENS`** — the anchor `SELF_ENERGY_MULTIPLY` already admitted the token and the "
        "refusal lived one step later, in `attachedEnergyFilter`. **ZERO new anchors, ZERO new readers "
        "(surface unmoved at 13), ZERO new ops, ZERO new op FIELDS, ZERO new `DamageCountSource` members, "
        "ZERO new `FIXTURE_POOL` ids and ZERO `packages/schema` bytes.** ⚠️ **THE SENTENCE STEP AND THE "
        "PRINTING STEP AGREE AT 1 AND 1** — the row is 1/1 — and that was VERIFIED at both kinds of site "
        "rather than assumed from the row being singular (D451/D461).) ")

def patch(path, lineno, pairs):
    lines = io.open(path, encoding='utf-8').read().split('\n')
    i = lineno - 1
    txt = lines[i]
    sep = txt.find('  //')
    if sep == -1:
        sep = txt.find(' //')
    head = txt if sep == -1 else txt[:sep]
    tail = '' if sep == -1 else txt[sep:]
    orig = head
    for old, new in pairs:
        assert head.count(old) == 1, (path, lineno, old, head.count(old), head[:200])
        head = head.replace(old, new, 1)
    assert head != orig
    # prepend the D500 note into the trailing comment, after its `// `
    if tail:
        j = tail.find('// ')
        assert j != -1, (path, lineno, tail[:80])
        tail = tail[:j+3] + NOTE + tail[j+3:]
    else:
        tail = '  // ' + NOTE
    lines[i] = head + tail
    io.open(path, 'w', encoding='utf-8').write('\n'.join(lines))
    print(f"patched {path}:{lineno}")

if __name__ == '__main__':
    import json
    for path, lineno, pairs in json.load(open(sys.argv[1])):
        patch(path, lineno, [tuple(p) for p in pairs])
