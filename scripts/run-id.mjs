#!/usr/bin/env node
// Imprime {runId, period, nowBrt, expired} da coleta atual.
import { runSlot } from "./lib/slot.mjs";

process.stdout.write(JSON.stringify(runSlot(new Date())) + "\n");
