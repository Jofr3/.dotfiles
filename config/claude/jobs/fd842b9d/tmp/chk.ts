import { programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
for (const id of ["sv06-165","sv10-170","sv10-223","sv05-161","sv10-036","sv04-266","sv07-011","sv07-045","svp-134","sv07-042","sv10.5w-083","sv10-020","sv10-187","sv08-072","sv09-089","sv08-171","sv10.5w-019","sv02-193","sv05-029","sv05-108","sv03-174","sv01-019"]) {
  const p = programFor(id);
  console.log(`${id.padEnd(14)} ${p ? "BUILT   " + JSON.stringify(p).slice(0,110) : "unbuilt"}`);
}
