import { programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
for (const id of ["sv06-164","sv01-127","sv02-192","sv10.5w-023","sv10.5w-107","sv07-132","sv07-163","sv07-171","sv08.5-100"]) {
  console.log(`${id.padEnd(14)} ${programFor(id) === undefined ? "no registry program" : "HAS PROGRAM"}`);
}
