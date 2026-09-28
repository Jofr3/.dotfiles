export const WIDE_DECL =
  "const FLIP_PREVENT_DAMAGE_AND_EFFECTS =\n  /^Flip a coin\\. If heads, during your opponent['’]s next turn, prevent all damage from and effects of attacks done to this Pokémon\\.$/;";
export const NARROW_DECL =
  "const FLIP_PREVENT_DAMAGE =\n  /^Flip a coin\\. If heads, during your opponent['’]s next turn, prevent all damage done to this Pokémon by attacks\\.$/;";
export const TAILS_DECL =
  "const FLIP_TAILS_SELF_CANT_ATTACK =\n  /^Flip a coin\\. If tails, during your next turn, this Pokémon can['’]t attack\\.$/;";
export const WIDE_ARM =
  '  if (FLIP_PREVENT_DAMAGE_AND_EFFECTS.test(effect)) {\n    return [\n      {\n        op: "coinFlipGate",\n        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract\'s gated-step list, not a thenable (arrays are not callable).\n        then: [{ op: "preventDamage", effects: true }],\n      },\n    ];\n  }';
export const NARROW_ARM_IF = "  if (FLIP_PREVENT_DAMAGE.test(effect)) {";
export const NARROW_ARM_THEN = '        then: [{ op: "preventDamage" }],';
export const TAILS_ARM =
  '  if (FLIP_TAILS_SELF_CANT_ATTACK.test(effect)) {\n    return [\n      {\n        op: "coinFlipGate",\n        // The field, ABSENT on every heads sibling and `true` here — never\n        // `false`, so a heads-gated program stays `toEqual`-identical to the\n        // registry rows it is compared against (D135\'s absent-field rule).\n        onTails: true,\n        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract\'s gated-step list, not a thenable (arrays are not callable).\n        then: [{ op: "preventAttack" }],\n      },\n    ];\n  }';

export type Cand = { id: string; find: string; replace: string; suites: string[] };

export const CANDS: Cand[] = [
  // ── A: WIDE declaration ──
  { id: "A1-wide-anchor-loses-its-caret", find: WIDE_DECL, replace: WIDE_DECL.replace("/^Flip", "/Flip"), suites: ["preventBlock"] },
  { id: "A2-wide-anchor-loses-its-terminator", find: WIDE_DECL, replace: WIDE_DECL.replace("this Pokémon\\.$/;", "this Pokémon/;"), suites: ["preventBlock"] },
  { id: "A3-wide-anchor-drops-the-apostrophe-class", find: WIDE_DECL, replace: WIDE_DECL.replace("opponent['’]s", "opponent's"), suites: ["preventBlock", "clauseApostrophe"] },
  // ── B: NARROW declaration ──
  { id: "B1-narrow-anchor-loses-its-caret", find: NARROW_DECL, replace: NARROW_DECL.replace("/^Flip", "/Flip"), suites: ["preventBlock", "classBlock", "flipDefenderAttackLock", "censusAtHead"] },
  { id: "B2-narrow-anchor-loses-its-terminator", find: NARROW_DECL, replace: NARROW_DECL.replace("by attacks\\.$/;", "by attacks/;"), suites: ["preventBlock", "classBlock", "flipDefenderAttackLock", "censusAtHead"] },
  { id: "B3-narrow-anchor-drops-the-apostrophe-class", find: NARROW_DECL, replace: NARROW_DECL.replace("opponent['’]s", "opponent's"), suites: ["preventBlock", "clauseApostrophe"] },
  // ── C: TAILS declaration ──
  { id: "C1-tails-anchor-loses-its-caret", find: TAILS_DECL, replace: TAILS_DECL.replace("/^Flip", "/Flip"), suites: ["tailsGatedOp"] },
  { id: "C2-tails-anchor-loses-its-terminator", find: TAILS_DECL, replace: TAILS_DECL.replace("attack\\.$/;", "attack/;"), suites: ["tailsGatedOp"] },
  { id: "C3-tails-anchor-drops-the-apostrophe-class", find: TAILS_DECL, replace: TAILS_DECL.replace("can['’]t", "can't"), suites: ["tailsGatedOp", "clauseApostrophe"] },
  { id: "C4-tails-anchor-reads-the-winning-face", find: TAILS_DECL, replace: TAILS_DECL.replace("If tails,", "If heads,"), suites: ["tailsGatedOp"] },
  // ── D: arm 19b, and-effects branch ──
  { id: "D1-wide-arm-drops-the-effects-field", find: WIDE_ARM, replace: WIDE_ARM.replace('then: [{ op: "preventDamage", effects: true }],', 'then: [{ op: "preventDamage" }],'), suites: ["preventBlock"] },
  { id: "D2-wide-gate-gains-ontails", find: WIDE_ARM, replace: WIDE_ARM.replace('        op: "coinFlipGate",\n', '        op: "coinFlipGate",\n        onTails: true,\n'), suites: ["preventBlock", "tailsGatedOp"] },
  { id: "D3-wide-gate-dropped-block-lands-unconditionally", find: WIDE_ARM, replace: '  if (FLIP_PREVENT_DAMAGE_AND_EFFECTS.test(effect)) {\n    return [{ op: "preventDamage", effects: true }];\n  }', suites: ["preventBlock"] },
  // ── E: arm 19b, bare branch ──
  { id: "E1-narrow-arm-gains-the-effects-field", find: NARROW_ARM_THEN, replace: '        then: [{ op: "preventDamage", effects: true }],', suites: ["preventBlock", "classBlock"] },
  { id: "E2-narrow-arm-tests-the-wide-anchor", find: NARROW_ARM_IF, replace: "  if (FLIP_PREVENT_DAMAGE_AND_EFFECTS.test(effect)) {", suites: ["preventBlock", "censusAtHead", "classBlock"] },
  // ── F: arm 26, tails self-lock ──
  { id: "F1-tails-arm-drops-the-ontails-field", find: TAILS_ARM, replace: TAILS_ARM.replace("        onTails: true,\n", ""), suites: ["tailsGatedOp"] },
  { id: "F2-tails-arm-emits-the-neighbours-op", find: TAILS_ARM, replace: TAILS_ARM.replace('then: [{ op: "preventAttack" }],', 'then: [{ op: "preventRetreat" }],'), suites: ["tailsGatedOp"] },
];
