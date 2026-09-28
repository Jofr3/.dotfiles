import { Database } from "bun:sqlite";
const DB_PATH =
  "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/8437d86672ef67002c76a06d8e29643de1a9c95e9422816cce0e554c6c5b7286.sqlite";
const db = new Database(DB_PATH, { readonly: true });
const needles = [
  "damage to each of your opponent's Pok",
  "damage for each Basic Energy attached to this Pok",
];
for (const n of needles) {
  console.log("=== " + n);
  const rows = db.query(
    `select c.id, c.set_id, c.name, c.legal_standard, j.value as atk
       from cards c, json_each(c.attacks_json) j
      where json_extract(j.value,'$.effect') like ?`,
  ).all("%" + n + "%") as any[];
  for (const r of rows) console.log(r.id, "|", r.set_id, "|", r.name, "| legal=", r.legal_standard, "|", r.atk);
}
