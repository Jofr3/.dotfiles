import { splitAttackTrailingClause, deriveAttackDamageBonus, deriveAttackDamageSuppression, deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const P = "If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness.";
const H = "If you have 3 or more Energy in play, this attack does 70 more damage.";
console.log("split(<P> Draw a card.):", JSON.stringify(splitAttackTrailingClause(`${P} Draw a card.`)));
console.log("split(<H> Draw a card.):", JSON.stringify(splitAttackTrailingClause(`${H} Draw a card.`)));
console.log("bonus(leading text):", deriveAttackDamageBonus(`Draw a card. ${P}`));
console.log("suppr(leading text):", deriveAttackDamageSuppression(`Draw a card. ${P}`));
console.log("bonus(<P> Draw a card.):", deriveAttackDamageBonus(`${P} Draw a card.`));
console.log("effect(Draw a card.):", JSON.stringify(deriveAttackEffect("Draw a card.")));
