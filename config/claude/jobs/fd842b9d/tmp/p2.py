import re
ATTACK_HAND_SEARCH = re.compile(
  "^(?:You may search|Search) your deck for (?:(an? [^,.]+?)(, reveal it,)? and put it"
  "|up to (\\d+) ([^,.]+?)( of different types)?(, reveal them,)? and put them)"
  " into your hand\\. Then, shuffle your deck\\.$")
rows = [
 "You may search your deck for any number of Fennel cards, reveal them, and put them into your hand. Then, shuffle your deck.",
 "You may search your deck for any number of Basic Lillie's Pokémon and put them onto your Bench. Then, shuffle your deck.",
 "You may search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.",
 # counterfactual: replace "any number of" with "up to 2"
 "You may search your deck for up to 2 Fennel cards, reveal them, and put them into your hand. Then, shuffle your deck.",
]
for r in rows:
    m = ATTACK_HAND_SEARCH.match(r)
    print(("MATCH " + repr(m.groups())) if m else "null  ", "::", r[:70])
