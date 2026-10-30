import { test } from "node:test";
import assert from "node:assert/strict";
import { freshView } from "../site/freshness.mjs";

const T = new Date("2026-11-02T20:05:00-03:00");
const hours = (h) => new Date(T.getTime() + h * 3600e3);
const data = () => ({
  nextRuns: ["2026-11-03T08:00:00-03:00", "2026-11-03T20:00:00-03:00"],
  cheapestNow: { modelId: "lg-c6", price: 8400, checkedAt: T.toISOString() },
  models: [
    { id: "lg-c6", stats: { stale: false, current: { price: 8400, checkedAt: T.toISOString() } }, classification: { level: "excellent", reference: 8400, diffPct: 0 } },
    { id: "tcl-c6k", stats: { stale: false, current: null }, classification: { level: "none", reference: null, diffPct: null } },
  ],
});

test("freshView mantém tudo quando os dados são recentes", () => {
  const v = freshView(data(), hours(10));
  assert.equal(v.models[0].stats.stale, false);
  assert.equal(v.models[0].classification.level, "excellent");
  assert.equal(v.cheapestNow.price, 8400);
  assert.equal(v.nextRuns.length, 2);
});

test("freshView marca stale após 36h sem regenerar data.json e não classifica preço velho", () => {
  const v = freshView(data(), hours(37));
  assert.equal(v.models[0].stats.stale, true);
  assert.equal(v.models[0].classification.level, "none");
  assert.equal(v.cheapestNow.stale, true);
});

test("freshView remove próximas consultas que já passaram", () => {
  const v = freshView(data(), new Date("2026-11-03T09:00:00-03:00"));
  assert.deepEqual(v.nextRuns, ["2026-11-03T20:00:00-03:00"]);
});

test("freshView não quebra sem oferta nem cheapestNow", () => {
  const d = data();
  d.cheapestNow = null;
  const v = freshView(d, hours(40));
  assert.equal(v.cheapestNow, null);
  assert.equal(v.models[1].stats.stale, false);
});
