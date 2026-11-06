// Draw the plan sheet for a seed:  node tools/sheet.js [seed]
import { writeFileSync, mkdirSync } from "node:fs";
import { run } from "../docs/humours.js";
import { planSheet } from "../docs/sheet.js";
const seed = Number(process.argv[2] || 1);
const state = run({ seed });
mkdirSync("media", { recursive: true });
writeFileSync("media/sheet.svg", planSheet(state));
console.error(`wrote media/sheet.svg — seed ${seed}, step ${state.t}`);
