type SurvivalKind = "equivalent" | "unreachable-population" | "unreachable-shape";
type M = { id: string; survives?: { kind: SurvivalKind; reason: string } };
export const ROWS: readonly M[] = [
  { id: "a", survives: { kind: "unreachable-population", why: "..." } },
];
