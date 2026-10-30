import { test } from "node:test";
import assert from "node:assert/strict";
import { brtDate, bestOffer, validRuns, modelStats, dailySeries } from "../scripts/lib/stats.mjs";
import { runs, LAST_CHECK, hoursAfter } from "./fixtures/runs.mjs";

test("brtDate agrupa pelo dia em São Paulo, não em UTC", () => {
  assert.equal(brtDate("2026-11-01T22:30:00-03:00"), "2026-11-01");
  assert.equal(brtDate("2026-11-02T01:30:00Z"), "2026-11-01");
});

test("bestOffer usa parcelado quando Pix é nulo e marca usedInstallments", () => {
  const best = bestOffer(runs[1], "lg-c6");
  assert.equal(best.price, 9000);
  assert.equal(best.usedInstallments, true);
  assert.equal(best.store, "magalu");
});

test("bestOffer escolhe o menor entre ofertas repetidas da mesma loja", () => {
  const best = bestOffer(runs[3], "lg-c6");
  assert.equal(best.price, 7900);
  assert.equal(best.usedInstallments, false);
});

test("bestOffer ignora ofertas sem estoque", () => {
  assert.equal(bestOffer(runs[5], "lg-c6").price, 8600);
});

test("validRuns exclui execuções failed e sem checks", () => {
  const ids = validRuns(runs).map((r) => r.runId);
  assert.equal(ids.length, 6);
  assert.ok(!ids.includes("2026-10-31T20"));
});

test("modelStats de modelo sem ofertas retorna nulos sem lançar erro", () => {
  const s = modelStats(runs, "tcl-c6k", LAST_CHECK);
  assert.equal(s.current, null);
  assert.equal(s.sysMin, null);
  assert.equal(s.mean, null);
  assert.equal(s.runsWithOffer, 0);
});

test("modelStats calcula mínimo, máximo, média e variação", () => {
  const s = modelStats(runs, "lg-c6", LAST_CHECK);
  assert.equal(s.current.price, 8400);
  assert.equal(s.previous.price, 8600);
  assert.equal(s.changeAbs, -200);
  assert.equal(s.changePct, -2.3);
  assert.deepEqual(s.sysMin, { price: 7900, date: "2026-11-01", store: "magalu" });
  assert.deepEqual(s.sysMax, { price: 10000, date: "2026-10-30", store: "amazon" });
  assert.equal(s.mean, 8733.33);
  assert.equal(s.savingsVsMeanPct, 3.8);
  assert.equal(s.min30, 7900);
  assert.equal(s.min90, 7900);
  assert.equal(s.runsWithOffer, 6);
});

test("modelStats marca stale após 36 h sem confirmação", () => {
  assert.equal(modelStats(runs, "lg-c6", hoursAfter(LAST_CHECK, 35)).stale, false);
  assert.equal(modelStats(runs, "lg-c6", hoursAfter(LAST_CHECK, 37)).stale, true);
});

test("min30 ignora preços com mais de 30 dias", () => {
  const s = modelStats(runs, "lg-c6", new Date("2026-12-01T21:00:00-03:00"));
  assert.equal(s.min30, 8400);
  assert.equal(s.min90, 7900);
});

test("dailySeries tem um ponto por dia e loja, no dia BRT", () => {
  const series = dailySeries(runs, "lg-c6");
  const keys = series.map((p) => `${p.date}|${p.store}`);
  assert.equal(new Set(keys).size, keys.length);
  const amazon1101 = series.find((p) => p.date === "2026-11-01" && p.store === "amazon");
  assert.equal(amazon1101.price, 8500);
  assert.ok(!series.some((p) => p.date === "2026-11-02" && p.store === "magalu"));
});

test("dailySeries marca newMin só quando bate a mínima anterior", () => {
  const mins = dailySeries(runs, "lg-c6").filter((p) => p.newMin).map((p) => `${p.date}|${p.price}`);
  assert.deepEqual(mins, ["2026-10-31|9000", "2026-11-01|7900"]);
});
