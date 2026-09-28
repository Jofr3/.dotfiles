import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A precedent at the same ADDRESS is not a precedent for the same QUESTION — date it before citing it (D501)

D501's work order instructed the builder to *"check what `poisonDamage` did about this — it is the
shipped precedent at the same address, so whatever argument it made is the one to re-derive rather
than reinvent."*

**`poisonDamage` made no argument.** It landed **2026-07-14**; `apps/api/src/lobby/match.ts` did not
exist until **07-23**; `MATCH_RECORD_VERSION` first appeared **07-26**. The sibling predates record
versioning by twelve days. It is a precedent for the **shape** — amount on the condition, counters
converted at the producer, an optional op rider against a rule constant — and **silent on the
constant**.

🛑 **The phrase "at the same address" concealed the difference, and the failure mode is worse than a
dead end**: a builder can infer *"the sibling didn't bump, so neither should I"* from an absence that
means nothing at all. That is D476's hazard — the citation's content contradicting the sentence
citing it.

**Run `git log -S` on the precedent and compare its date against the mechanism you are asking it
about.** A precedent that predates the question cannot have answered it.

### Ask what the OPTIONAL shape would DISARM, not only what it would mean (D501)

D501 needed a new key on a record persisted in `MatchRecord.state`. The optional road was genuinely
available: D441's discriminator answers yes (absent would read as the default, and every old record
*did* mean the default), and D434's *"the rest must be old"* was satisfied — only the second time on
record.

**What decided it was a shipped compile-time guard.** Two `satisfies SpecialConditions` sites exist
precisely so that an added engine field is *a compile error rather than a silent drop*. **An optional
key satisfies both while reaching neither surface** — it would have silently disarmed the two
instruments written to catch exactly this class of omission. Both guards fired on the required-field
edit; **that is evidence, where the rule was only an argument.**

⚠️ **And a fourth position in the degradation sequence.** D432 *no rest to carry the meaning*; D434
*rest not old*; D435 *rest old but the degradation is NaN*; **D501 *rest old, option available, and
the rest cannot witness the loss*** — the sibling keys were byte-identical at both values, so nothing
in the record could reveal which one was meant. Driven: the board computes `damage + undefined` →
`NaN`, `NaN >= hp` is false, and the body **can never be Knocked Out again on a board that looks
entirely normal.**

### Grep every READ SITE of a constant before changing it (D501, applying D412)

D501 made a hard-coded confusion self-damage configurable. Grepping the read sites first found a
**live false claim to players**: the HUD printed *"Confused: attacking flips a coin — tails: 30 damage
to itself"* off the rotation alone — wrong at the exact moment a player decides whether to attack —
plus two prose claims in `events.ts` and `log.ts` asserting *"the 30 self-damage"*.

🛑 **A constant that was true becomes a lie the moment it becomes configurable**, and the lie lands
wherever someone quoted it rather than read it. **Enumerate the readers before the edit, not after
the tests pass** — none of these three would have reddened anything.

⚠️ **And check the surfaces separately.** D501 fixed the local HUD and left the online one with no
hint at all, which the decision row records: **the asymmetry existed before the slice and only
started to matter because of it.**

### Run the bare-token census FIRST — its output may be the decision not to use a value-keyed pass (D501, sharpening D492)

D492 established that a bare `toBe(N)` replacement is unsafe for small literals. D501 shows the
cheaper move: **count the token repo-wide before choosing the method.**

Its two census literals matched **186** and **243** times across the repo. That number is not a
warning to be careful — it is the answer: **every literal was patched by line number**, each with a
one-occurrence-in-region assertion, and no value-keyed pass was attempted at all.

**The census is a decision procedure, not a hazard check.** Run it first and let the count pick the
method.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
