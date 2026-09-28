import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
P = "packages/engine/src/attack.ts"

patch(P,
"""    case "pokemonInPlay":
      flips = countPokemonInPlay(state, attackerSeat, count.filter);
      break;
  }""",
"""    case "pokemonInPlay":
      flips = countPokemonInPlay(state, attackerSeat, count.filter);
      break;
    // \U0001f195\U0001f195 D475 — the count BOTH SEATS contribute to: the Energy attached to the
    // attacker's Active PLUS the Energy attached to the defender's, added and then
    // flipped once per card. TWO calls to the SAME `countAttachedEnergy` the arm above
    // uses, at the SAME `null` filter, because the printed sentence carries no type
    // word — D159, and the identical delegation
    // `scaledAttackDamage`'s `bothActivesEnergyCount` arm makes for the DAMAGE
    // spelling of this noun (`attack.ts` ~line 419). One printed noun, one counter.
    //
    // ⚠️ **THE LOCALS ARE NAMED `ownActive`/`foeActive` AND NOT
    // `defenderActive`, ON PURPOSE** (D446/D448): the damage arm four hundred lines up
    // spells `const defenderActive = state.players[defenderSeat].active;` and a
    // byte-twin here would make a mutant row match twice, in a function that row does
    // not describe. Do not "tidy" the two into one helper.
    //
    // ⚠️ **THE ATTACKER SIDE IS THE LIVE ACTIVE, NOT THE DECLARING BODY, AND THAT
    // IS THIS SITE'S CONVENTION RATHER THAN THE FOLD'S.** `takeFlips` reads its count
    // off `state` AT THE FLIP SITE — the `attachedEnergy` arm above says so and spells
    // it the same way — while `scaledAttackDamage` reads `attacker`, the Active as of
    // DECLARATION. The two cannot disagree on any reachable board (`D196-live-active`
    // is a declared equivalent for exactly that reason: the only pre-fold mutation of
    // the attacker is the confusion self-damage, which carries `energy` across
    // untouched), so the choice is unobservable and is made by matching the SITE.
    //
    // A missing defending Active cannot happen here — the attack gate required a
    // Defending Pokémon and every path that removes one returns first — so the `0`
    // keeps the arm TOTAL rather than covering a case, the same shape every
    // cross-board arm in this file uses and the same one the damage twin states.
    case "bothActivesEnergy": {
      const ownActive = state.players[attackerSeat].active ?? attacker;
      const foeActive = state.players[otherSeat(attackerSeat)].active;
      flips =
        countAttachedEnergy(state, ownActive, null) +
        (foeActive === null ? 0 : countAttachedEnergy(state, foeActive, null));
      break;
    }
  }""")
