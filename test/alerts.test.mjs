import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAlerts, alertKey } from "../scripts/lib/alerts.mjs";
import { makeRun, offer } from "./fixtures/runs.mjs";

const models = [{ id: "lg-c6" }];
const NO_EXT = { "lg-c6": { verified: false } };

function scenario(prevPrice, newPrice, newExtra = {}, { failedBetween = false } = {}) {
  const runs = [makeRun("2026-11-01T08", [offer("amazon", prevPrice, "2026-11-01T08:05:00-03:00")])];
  if (failedBetween) runs.push(makeRun("2026-11-01T20", [], "failed"));
  const run = makeRun("2026-11-02T08", [offer("amazon", newPrice, "2026-11-02T08:05:00-03:00", newExtra)]);
  runs.push(run);
  return { runs, run };
}
const types = (alerts) => alerts.map((a) => a.type).sort();

test("queda de 6% gera drop e new_low com preços e economia", () => {
  const { runs, run } = scenario(10000, 9400);
  const alerts = detectAlerts({ runs, run, models, external: NO_EXT, existing: [] });
  assert.deepEqual(types(alerts), ["drop", "new_low"]);
  const drop = alerts.find((a) => a.type === "drop");
  assert.equal(drop.previousPrice, 10000);
  assert.equal(drop.newPrice, 9400);
  assert.equal(drop.savingsPct, 6);
  assert.equal(drop.store, "amazon");
  assert.equal(drop.url, "https://www.amazon.com.br/p/oled55c6");
  assert.equal(drop.key, alertKey("drop", "lg-c6", "amazon", 9400));
});

test("queda de 4% não gera drop", () => {
  const { runs, run } = scenario(10000, 9600);
  const alerts = detectAlerts({ runs, run, models, external: NO_EXT, existing: [] });
  assert.deepEqual(types(alerts), ["new_low"]);
});

test("preço no ou abaixo da mínima externa gera below_external", () => {
  const { runs, run } = scenario(10000, 10000);
  const external = { "lg-c6": { verified: true, lowest: 10000 } };
  assert.deepEqual(types(detectAlerts({ runs, run, models, external, existing: [] })), ["below_external"]);
});

test("cupom de 2% não alerta; de 3% alerta", () => {
  const c2 = scenario(10000, 10000, { coupon: { code: "X", description: "2% off", discountPct: 2 } });
  assert.deepEqual(detectAlerts({ ...c2, models, external: NO_EXT, existing: [] }), []);
  const c3 = scenario(10000, 10000, { coupon: { code: "Y", description: "3% off", discountPct: 3 } });
  assert.deepEqual(types(detectAlerts({ ...c3, models, external: NO_EXT, existing: [] })), ["coupon"]);
});

test("promoção com prazo gera promo_deadline", () => {
  const s = scenario(10000, 10000, { promoEndsAt: "2026-11-03T23:59:00-03:00" });
  assert.deepEqual(types(detectAlerts({ ...s, models, external: NO_EXT, existing: [] })), ["promo_deadline"]);
});

test("alertas já emitidos não se repetem", () => {
  const { runs, run } = scenario(10000, 9400);
  const first = detectAlerts({ runs, run, models, external: NO_EXT, existing: [] });
  assert.deepEqual(detectAlerts({ runs, run, models, external: NO_EXT, existing: first }), []);
});

test("execução failed no meio é ignorada na comparação", () => {
  const { runs, run } = scenario(10000, 9400, {}, { failedBetween: true });
  const drop = detectAlerts({ runs, run, models, external: NO_EXT, existing: [] }).find((a) => a.type === "drop");
  assert.equal(drop.previousPrice, 10000);
});

test("primeira execução não gera new_low nem drop", () => {
  const run = makeRun("2026-11-02T08", [offer("amazon", 9000, "2026-11-02T08:05:00-03:00")]);
  assert.deepEqual(detectAlerts({ runs: [run], run, models, external: NO_EXT, existing: [] }), []);
});
