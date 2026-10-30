#!/usr/bin/env node
// Uso: node scripts/notify-alerts.mjs <alerts-antigo.json> <alerts-novo.json> <models.json>
// Imprime um JSON [{title, body}] com uma Issue por alerta novo.
import { readFileSync, existsSync } from "node:fs";
import { diffAlerts, issueFor } from "./lib/alerts.mjs";

const [oldPath, newPath, modelsPath] = process.argv.slice(2);
const read = (p) => (p && existsSync(p) && readFileSync(p, "utf8").trim() ? JSON.parse(readFileSync(p, "utf8")) : []);
const models = read(modelsPath);
const issues = diffAlerts(read(oldPath), read(newPath)).map((a) => issueFor(a, models));
process.stdout.write(JSON.stringify(issues));
