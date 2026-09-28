import * as eff from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const src = await Bun.file("/home/jofre/projects/luminous_ui/packages/engine/src/interpreter.ts").text();

// 1. withConsequence — ONE call site, and its gate.
const calls = [...src.matchAll(/withConsequence\(/g)].length;
const decl = [...src.matchAll(/function withConsequence\(/g)].length;
console.log(`withConsequence: ${decl} declaration + ${calls - decl} call site(s) in interpreter.ts`);
const elsewhere = await Bun.$`grep -rl withConsequence /home/jofre/projects/luminous_ui/packages/engine/src /home/jofre/projects/luminous_ui/src /home/jofre/projects/luminous_ui/apps --include=*.ts --include=*.tsx`.text();
console.log(`files mentioning it: ${elsewhere.trim().split("\n").length} (the rest are doc blocks)`);

// 2. recordSlotOf(applyStatus) — the FIRST gate withConsequence applies.
const slotFn = /function recordSlotOf\([\s\S]*?\n}/.exec(src)?.[0] ?? "";
console.log(`\nrecordSlotOf's body names applyStatus? ${slotFn.includes("applyStatus")}`);
console.log(`  slots it answers for: ${[...slotFn.matchAll(/case "([a-zA-Z]+)":/g)].map((m) => m[1]).join(", ") || "(see body)"}`);

// 3. does applyStatus PARK? The park is `{ park: … }` out of stepOp's arm.
const arm = /case "applyStatus":[\s\S]{0,400}/.exec(src)?.[0] ?? "(arm not found by that shape)";
console.log(`\nstepOp's applyStatus dispatch:\n${arm.split("\n").slice(0, 4).join("\n")}`);

// 4. Does D501 add a BoardCondition member? conditionNote's only input.
const before = await Bun.$`git -C /home/jofre/projects/luminous_ui show HEAD:packages/engine/src/effects.ts`.text();
const members = (s: string) => new Set([...s.matchAll(/kind: "([a-zA-Z]+)"/g)].map((m) => m[1]));
const nowSrc = await Bun.file("/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts").text();
const addedKinds = [...members(nowSrc)].filter((k) => !members(before).has(k));
console.log(`\nnew \`kind: "…"\` literals anywhere in effects.ts vs HEAD: ${addedKinds.length ? addedKinds.join(", ") : "NONE"}`);

// 5. the op union's shape: did any new EffectOp member land?
const opKinds = (s: string) => new Set([...s.matchAll(/op: "([a-zA-Z]+)"/g)].map((m) => m[1]));
const addedOps = [...opKinds(nowSrc)].filter((k) => !opKinds(before).has(k));
console.log(`new \`op: "…"\` literals vs HEAD: ${addedOps.length ? addedOps.join(", ") : "NONE"}`);
