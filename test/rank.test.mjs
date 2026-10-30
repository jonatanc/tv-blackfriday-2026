import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, rankModels } from "../scripts/lib/rank.mjs";

const stats = (price, sysMin, runsWithOffer = 6) => ({
  current: price == null ? null : { price },
  sysMin: sysMin == null ? null : { price: sysMin },
  runsWithOffer,
});
const ext = (lowest) => ({ verified: true, lowest });
const NO_EXT = { verified: false, label: "Histórico externo não verificado" };

test("preço igual à mínima externa verificada é excelente", () => {
  assert.equal(classify(stats(7000, 7500, 1), ext(7000)).level, "excellent");
});

test("até 5% acima da referência é boa oportunidade", () => {
  const c = classify(stats(7350, 7500, 1), ext(7000));
  assert.equal(c.level, "good");
  assert.equal(c.reference, 7000);
  assert.equal(c.diffPct, 5);
});

test("acima de 5% é aguardar", () => {
  assert.equal(classify(stats(7351, 7500, 1), ext(7000)).level, "wait");
});

test("sem externo verificado e menos de 6 execuções é sem histórico", () => {
  assert.equal(classify(stats(8000, 8000, 5), NO_EXT).level, "none");
});

test("sem externo mas com 6 execuções usa a mínima do sistema", () => {
  const c = classify(stats(8000, 8000, 6), NO_EXT);
  assert.equal(c.level, "excellent");
  assert.equal(c.reference, 8000);
});

test("referência é a menor entre externo e sistema", () => {
  assert.equal(classify(stats(7000, 6800, 6), ext(7000)).reference, 6800);
});

test("sem preço atual é sem histórico", () => {
  const c = classify(stats(null, null, 0), ext(7000));
  assert.equal(c.level, "none");
  assert.equal(c.diffPct, null);
});

test("rankModels ordena por nível, depois diferença e preço", () => {
  const e = (modelId, level, diffPct, price) => ({
    modelId, stats: { current: price == null ? null : { price } }, classification: { level, diffPct },
  });
  const ranked = rankModels([
    e("a", "none", null, null),
    e("b", "wait", 12, 9000),
    e("c", "good", 3, 8000),
    e("d", "excellent", -1, 7000),
    e("f", "good", 3, 7500),
  ]).map((x) => x.modelId);
  assert.deepEqual(ranked, ["d", "f", "c", "b", "a"]);
});
