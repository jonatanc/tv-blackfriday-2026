#!/usr/bin/env node
// Lê $DATA_DIR (padrão data/), escreve $OUT (padrão site/data.json) e $DATA_DIR/alerts.json.
// Imprime em stdout, como JSON, os alertas novos desta agregação.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { buildDashboard } from "./lib/build.mjs";

const DATA_DIR = process.env.DATA_DIR ?? "data";
const OUT = process.env.OUT ?? "site/data.json";
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

const runsDir = join(DATA_DIR, "runs");
const runs = existsSync(runsDir)
  ? readdirSync(runsDir).filter((f) => f.endsWith(".json")).map((f) => readJson(join(runsDir, f)))
  : [];

const alertsPath = join(DATA_DIR, "alerts.json");
const { data, newAlerts } = buildDashboard({
  models: readJson(join(DATA_DIR, "models.json"), []),
  external: readJson(join(DATA_DIR, "external-history.json"), {}),
  runs,
  alerts: readJson(alertsPath, []),
  now: new Date(),
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
const allAlerts = [...readJson(alertsPath, []), ...newAlerts];
writeFileSync(alertsPath, JSON.stringify(allAlerts, null, 2) + "\n");
process.stdout.write(JSON.stringify(newAlerts, null, 2) + "\n");
