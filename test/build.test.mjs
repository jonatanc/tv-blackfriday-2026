import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashboard, nextRuns } from "../scripts/lib/build.mjs";
import { runs, LAST_CHECK, makeRun, offer } from "./fixtures/runs.mjs";

const models = ["lg-c6", "sam-s85f", "sam-s85h", "tcl-c6k"].map((id) => ({ id, name: id, image: null }));
const external = Object.fromEntries(models.map((m) => [m.id, { verified: false, label: "Histórico externo não verificado" }]));

const build = (extra = {}) => buildDashboard({ models, external, runs, alerts: [], now: LAST_CHECK, ...extra });

test("data tem os 4 modelos, inclusive sem oferta", () => {
  const { data } = build();
  assert.equal(data.models.length, 4);
  const tcl = data.models.find((m) => m.id === "tcl-c6k");
  assert.equal(tcl.stats.current, null);
  assert.equal(tcl.classification.level, "none");
});

test("cheapestNow aponta o menor preço atual", () => {
  const { data } = build();
  assert.equal(data.cheapestNow.modelId, "lg-c6");
  assert.equal(data.cheapestNow.price, 8400);
});

test("cheapestNow é null sem ofertas", () => {
  assert.equal(build({ runs: [] }).data.cheapestNow, null);
});

test("lastRun é a última execução, mesmo falha", () => {
  const { data } = build();
  assert.equal(data.lastRun.runId, "2026-11-02T20");
  assert.equal(data.runsLog[0].runId, "2026-11-02T20");
  assert.equal(data.runsLog.length, 7);
});

test("latestChecks traz os checks do modelo na última execução válida", () => {
  const lg = build().data.models.find((m) => m.id === "lg-c6");
  assert.deepEqual(lg.latestChecks.map((c) => c.store), ["amazon"]);
});

test("nextRuns retorna os dois próximos horários 08h/20h BRT", () => {
  assert.deepEqual(nextRuns(new Date("2026-10-30T15:00:00-03:00")), [
    "2026-10-30T20:00:00-03:00",
    "2026-10-31T08:00:00-03:00",
  ]);
  assert.deepEqual(nextRuns(new Date("2026-10-30T21:00:00-03:00")), [
    "2026-10-31T08:00:00-03:00",
    "2026-10-31T20:00:00-03:00",
  ]);
});

test("nextRuns respeita o fim em 27/11 23h59", () => {
  assert.deepEqual(nextRuns(new Date("2026-11-27T09:00:00-03:00")), ["2026-11-27T20:00:00-03:00"]);
  assert.deepEqual(nextRuns(new Date("2026-11-28T09:00:00-03:00")), []);
});

test("alertas novos entram uma vez e não duplicam existentes", () => {
  // Até a 4ª execução (7900), que bate a mínima anterior (9000).
  const upToLow = runs.slice(0, 4);
  const first = build({ runs: upToLow });
  assert.ok(first.newAlerts.some((a) => a.type === "new_low"));
  const second = build({ runs: upToLow, alerts: first.data.alerts });
  assert.equal(second.newAlerts.length, 0);
  const keys = second.data.alerts.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("sem nenhuma execução o build não quebra", () => {
  const { data, newAlerts } = build({ runs: [] });
  assert.equal(data.lastRun, null);
  assert.deepEqual(newAlerts, []);
  assert.equal(data.models.length, 4);
});

test("fogão não entra em cheapestNow nem no ranking das TVs, mas aparece em models", () => {
  const withStove = [...models, { id: "brastemp-bfs5gdr", name: "Fogão", category: "fogao", image: null }];
  const stoveRun = makeRun("2026-11-02T21", [
    offer("magalu", 2000, "2026-11-02T21:05:00-03:00", { modelId: "brastemp-bfs5gdr" }),
  ]);
  const { data } = buildDashboard({ models: withStove, external, runs: [...runs, stoveRun], alerts: [], now: LAST_CHECK });
  assert.equal(data.cheapestNow.modelId, "lg-c6");
  assert.ok(!data.ranking.includes("brastemp-bfs5gdr"));
  const stove = data.models.find((m) => m.id === "brastemp-bfs5gdr");
  assert.equal(stove.category, "fogao");
  assert.equal(stove.stats.current.price, 2000);
  assert.equal(data.models.find((m) => m.id === "lg-c6").category, "tv");
});
