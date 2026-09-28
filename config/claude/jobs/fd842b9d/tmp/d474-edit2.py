import hashlib
P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
orig = open(P, "rb").read()
text = orig.decode("utf-8")

def splice(t, find, repl, label):
    parts = t.split(find)
    assert len(parts) == 2, f"{label}: find occurs {len(parts) - 1}x"
    assert find != repl
    return repl.join(parts)

# ── the union member ─────────────────────────────────────────────────────────
FIND_UNION = """export type AttackFlipCount =
  | { kind: "printed"; count: number }
  | { kind: "attachedEnergy"; energy: BasicEnergyType | "special" | null }
  | { kind: "untilTails" };"""
REPL_UNION = """export type AttackFlipCount =
  | { kind: "printed"; count: number }
  | { kind: "attachedEnergy"; energy: BasicEnergyType | "special" | null }
  | { kind: "pokemonInPlay"; filter: CardFilter }
  | { kind: "untilTails" };"""
text = splice(text, FIND_UNION, REPL_UNION, "union")

# ── the doc block above it gains the fourth bullet ───────────────────────────
FIND_DOC = """/** HOW MANY times an attack's printed sentence calls for the coin to be flipped
    (D128). Three members, because the pool prints the count three ways and only
    one of them is a number the deriver can read:
      • `printed` — the literal N of "Flip N coins." (D127), known at derivation.
      • `attachedEnergy` — "for each [{X}] Energy attached to this Pokémon", a
        BOARD fact resolved at the flip site. `energy` is the printed type filter,
        or null for the unfiltered form."""
REPL_DOC = """/** HOW MANY times an attack's printed sentence calls for the coin to be flipped
    (D128). 🆕🆕 **FOUR members as of D474**, because the pool prints the count four
    ways and only one of them is a number the deriver can read:
      • `printed` — the literal N of "Flip N coins." (D127), known at derivation.
      • `attachedEnergy` — "for each [{X}] Energy attached to this Pokémon", a
        BOARD fact resolved at the flip site. `energy` is the printed type filter,
        or null for the unfiltered form.
      • 🆕🆕 `pokemonInPlay` (D474) — "for each ⟨noun⟩ you have in play", the OTHER
        board fact the column counts coins by: BODIES rather than Energy, Active +
        Bench, stack tops only, resolved at the flip site through the shipped
        `countPokemonInPlay`. `filter` is the printed noun resolved by
        `inPlayBodyFilter` — the same closed vocabulary the three
        `DamageCountSource.pokemonInPlay` anchors use, so "which bodies does this
        noun name" keeps ONE answer across two unions (D159).

        🛑 **A SECOND MEMBER AND NOT A FIELD ON `attachedEnergy`, BY D440's RULE
        READ RATHER THAN COPIED**: *nullary or asymmetric payload ⇒ two members;
        identical payload ⇒ one member with the discriminator as a field.* The
        payloads are asymmetric — `attachedEnergy` carries an ENERGY filter
        (`BasicEnergyType | "special" | null`, read by PROVISION when typed and by
        CARD when null) and this carries a `CardFilter` over BODIES. Collapsing
        them would make one field answer two different questions about two
        different populations, which is the second answer to one question D159
        forbids, and would leave every `attachedEnergy` value carrying a key it
        must ignore.

        ⚠️ **NO SEAT, AND THAT IS A STATEMENT ABOUT THE PRINT.** The column spells
        this count once, own-side (*"you have in play"*), so a seat field would
        have exactly one inhabitant and would spell a card nobody printed (D441:
        the test is how many INDEPENDENT questions the PRINT asks). The
        `DamageCountSource` sibling carries `seat` because ONE of its anchors
        spells each side; this family's does not. The falsifier is executable —
        the day the column prints an opponent-side body flip count, the field is
        owed in the same edit."""
text = splice(text, FIND_DOC, REPL_DOC, "doc")

# ── the reader arm, directly after the perEnergy arm ─────────────────────────
FIND_ARM = """    return per >= 1
      ? { kind: "perHeads", flips: { kind: "attachedEnergy", energy: null }, per }
      : null;
  }
"""
REPL_ARM = FIND_ARM + """  // 🆕🆕 D474 — the OTHER board-counted flip count: BODIES in play rather than
  // Energy attached. Placed directly after the Energy arm it is the sibling of, so
  // the two board-counted members sit together on the page and a reader meeting one
  // meets the other — they answer DIFFERENT numbers on every board, and that is the
  // one thing about this member worth being unable to miss. The placement is
  // LEGIBILITY and not behaviour: the two anchors are STRUCTURALLY disjoint (see
  // `ATTACK_COIN_PER_BODY_IN_PLAY`), so no input can reach both and swapping them
  // changes no answer — which is why the swap row below is a DECLARED equivalent
  // rather than a killed one.
  //
  // TWO guards and not one, and they refuse for two different reasons — the
  // `IN_PLAY_BODY_SCALE` arm's verbatim, because they are the same two questions:
  // `per >= 1` is the coin family's printed-zero guard (a printed 0 would spend a
  // flip, and an `rngState` step, to add nothing), and `filter !== null` is the
  // VOCABULARY — *"Ancient Pokémon"* reaches this line and must leave it LOUD,
  // because no `cardSchema` column classifies the banner and a filter that counts 0
  // forever while `BUILT.attack` steps for it is strictly worse than an unbuilt
  // sentence (D190b/D199 at the instrument layer). Neither guard subsumes the other.
  //
  // ⚠️ **NO FLIP CEILING, and that is `MAX_PRINTED_FLIPS`' own stated rule rather
  // than an omission**: a bound is owed to the SOURCE of the number, not to the loop
  // it feeds. Printed digits come from third-party ingested text; this count is read
  // off the engine's own board and is bounded by the six Bench slots plus the Active.
  // The `attachedEnergy` arm above carries no ceiling for the identical reason.
  const inPlayBodies = ATTACK_COIN_PER_BODY_IN_PLAY.exec(effect);
  if (inPlayBodies !== null) {
    const per = Number(inPlayBodies[2]);
    // Through the SHARED vocabulary, not a local table — `inPlayBodyFilter` is the
    // one place this file resolves a printed body noun, and an unresolvable noun
    // answers `null` here exactly as it does for the three damage anchors.
    const filter = inPlayBodyFilter(inPlayBodies[1] ?? "");
    return filter !== null && per >= 1
      ? { kind: "perHeads", flips: { kind: "pokemonInPlay", filter }, per }
      : null;
  }
"""
text = splice(text, FIND_ARM, REPL_ARM, "arm")

payload = text.encode("utf-8")
with open(P, "wb") as fh:
    fh.write(payload)
now = open(P, "rb").read()
print("before", len(orig), "after", len(now), "delta", len(now) - len(orig))
print("sha", hashlib.sha256(now).hexdigest()[:16])
