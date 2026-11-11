import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRun } from "../scripts/lib/validate.mjs";
import { makeRun, offer } from "./fixtures/runs.mjs";

const valid = () => makeRun("2026-11-01T08", [
  offer("amazon", 9000, "2026-11-01T08:05:00-03:00"),
  { modelId: "tcl-c6k", store: "kabum", status: "not_queryable", reason: "captcha" },
]);

test("snapshot válido não tem erros", () => {
  assert.deepEqual(validateRun(valid()), []);
});

test("run failed sem checks é válido", () => {
  assert.deepEqual(validateRun(makeRun("2026-11-01T08", [], "failed")), []);
});

test("loja fora da lista é erro", () => {
  const r = valid();
  r.checks[0].store = "submarino";
  assert.ok(validateRun(r).some((e) => e.includes("store")));
});

test("modelo fora da lista é erro", () => {
  const r = valid();
  r.checks[0].modelId = "lg-c5";
  assert.ok(validateRun(r).some((e) => e.includes("modelId")));
});

test("status ok sem offer é erro", () => {
  const r = valid();
  delete r.checks[0].offer;
  assert.ok(validateRun(r).length > 0);
});

test("not_queryable com offer é erro", () => {
  const r = valid();
  r.checks[1].offer = r.checks[0].offer;
  assert.ok(validateRun(r).length > 0);
});

test("url sem https é erro", () => {
  const r = valid();
  r.checks[0].offer.url = "http://amazon.com.br/x";
  assert.ok(validateRun(r).some((e) => e.includes("url")));
});

test("oferta ok sem nenhum preço é erro", () => {
  const r = valid();
  r.checks[0].offer.pricePix = null;
  r.checks[0].offer.priceInstallments = null;
  assert.ok(validateRun(r).some((e) => e.includes("preço")));
});

test("preço negativo ou string é erro", () => {
  const r = valid();
  r.checks[0].offer.pricePix = "R$ 9.000";
  assert.ok(validateRun(r).length > 0);
});

test("runId e checkedAt com formato inválido são erro", () => {
  const r = valid();
  r.runId = "2026-11-01 08h";
  r.checks[0].offer.checkedAt = "01/11/2026";
  const errs = validateRun(r);
  assert.ok(errs.some((e) => e.includes("runId")));
  assert.ok(errs.some((e) => e.includes("checkedAt")));
});

test("fogão e loja oficial Brastemp são aceitos", () => {
  const r = valid();
  r.checks[0].modelId = "brastemp-bfs5gdr";
  r.checks[0].store = "brastemp";
  assert.deepEqual(validateRun(r), []);
});
