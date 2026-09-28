p = "/home/jofre/projects/luminous_ui/docs/workstreams/simulator.md"
backup = open(p, encoding="utf-8").read()
FIND = ('| "Switch this Pokémon with 1 of your Benched **{L}** Pokémon." (Vikavolt) | `sv07-053` — 1 legal | '
        '⏹️ ⚠️ REFUSED — a SECOND narrowing axis |')
REPL = ('| "Switch this Pokémon with 1 of your Benched **{L}** Pokémon." (Vikavolt) | `sv07-053` — 1 legal | '
        '✅ **TAKEN AT D468** — `censusAttackCorpus.ts` **FILE LINE 499**. ⚠️ **THE REFUSAL BELOW IS CORRECTED '
        'RATHER THAN DELETED (D442), AND IT WAS RIGHT ABOUT ITS OWN SUBJECT**: `ownerPokemon` genuinely cannot '
        'say `{L}` and still must not try — `switchSeam.test.ts` §4 keeps that claim, re-pointed onto the '
        'derived VALUE (D449/D438) instead of onto a `toBeNull` the build falsified. What the note never said '
        'is that a DIFFERENT field already could: `switchActive.targetType?: PokemonType` shipped at **D273** '
        'for the ABILITY surface (Pecharunt ex, 5 legal), `switchBenchNarrowing` already narrows the Bench end '
        'through `matchesFilter`\'s `typedPokemon`, and `switchTargetNoun` already spells the type into the '
        'caption — so the ATTACK-surface READER was the only missing piece, and it cost ONE anchor '
        '(`ATTACK_SELF_SWITCH_TYPED`) and ONE arm. **A refusal names a CARRIER, and the carrier can be wrong** '
        '(D457): this one priced the row against the field that refused it rather than against the field that '
        'would serve it, and the correct field was named in this very op\'s doc block, three slices earlier. |')
try:
    n = backup.count(FIND)
    assert n == 1, "row occurs %dx" % n
    out = backup.replace(FIND, REPL, 1)
    assert out != backup
    with open(p, "wb") as fh:
        fh.write(out.encode("utf-8"))
    print("simulator.md: refusal row corrected, %d -> %d bytes (+%d)" % (len(backup), len(out), len(out)-len(backup)))
except Exception as e:
    with open(p, "wb") as fh:
        fh.write(backup.encode("utf-8"))
    print("RESTORED after", e); raise
