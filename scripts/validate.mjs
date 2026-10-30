#!/usr/bin/env node
// Uso: node scripts/validate.mjs data/runs/<runId>.json [...]
import { readFileSync } from "node:fs";
import { validateRun } from "./lib/validate.mjs";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("uso: node scripts/validate.mjs <snapshot.json> [...]");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  let errs;
  try {
    errs = validateRun(JSON.parse(readFileSync(file, "utf8")));
  } catch (e) {
    errs = [`JSON ilegível: ${e.message}`];
  }
  if (errs.length) {
    failed = true;
    console.error(`✗ ${file}`);
    for (const e of errs) console.error(`  - ${e}`);
  } else {
    console.log(`✓ ${file}`);
  }
}
process.exit(failed ? 1 : 0);
