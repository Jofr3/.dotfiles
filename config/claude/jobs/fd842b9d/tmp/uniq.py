import io
with io.open("packages/engine/src/effects.ts", encoding="utf-8") as fh:
    src = fh.read()
CANDS = {
 "arm-block": '      { op: "damageDefender", amount },\n      { op: "spreadDamage", target: "opponentBench", amount },\n',
 "amount-line": '    const amount = Number(match[1]);\n    return [\n      { op: "damageDefender", amount },\n',
 "anchor-whole": 'const SPREAD_EACH_OPPONENT_POKEMON = new RegExp(\n  `^This attack does (\\\\d+) damage to each of your opponent[\'’]s Pokémon\\\\.` +\n',
 "anchor-line1": '  `^This attack does (\\\\d+) damage to each of your opponent[\'’]s Pokémon\\\\.` +\n',
 "anchor-two-lines": '  `^This attack does (\\\\d+) damage to each of your opponent[\'’]s Pokémon\\\\.` +\n    `(?: \\\\(Don[\'’]t apply Weakness and Resistance for Benched Pokémon\\\\.\\\\))?$`,\n',
 "shared-tail": '    `(?: \\\\(Don[\'’]t apply Weakness and Resistance for Benched Pokémon\\\\.\\\\))?$`,\n',
}
for k, v in CANDS.items():
    print("%-20s %d" % (k, src.count(v)))
