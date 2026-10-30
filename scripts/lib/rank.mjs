// Classificação de oportunidade: avalia o preço, não a qualidade da TV.
import { pct } from "./stats.mjs";

const GOOD_FACTOR = 1.05;
const MIN_OWN_RUNS = 6;
const ORDER = { excellent: 0, good: 1, wait: 2, none: 3 };

export function classify(stats, external) {
  const extOk = external?.verified === true && typeof external.lowest === "number";
  const none = { level: "none", reference: null, diffPct: null };
  if (!stats?.current) return none;
  if (!extOk && stats.runsWithOffer < MIN_OWN_RUNS) return none;

  const candidates = [extOk ? external.lowest : null, stats.sysMin?.price ?? null].filter((v) => v != null);
  const reference = Math.min(...candidates);
  const price = stats.current.price;
  const level = price <= reference ? "excellent" : price <= reference * GOOD_FACTOR ? "good" : "wait";
  return { level, reference, diffPct: pct(reference, price) };
}

export function rankModels(entries) {
  return [...entries].sort(
    (a, b) =>
      ORDER[a.classification.level] - ORDER[b.classification.level] ||
      (a.classification.diffPct ?? Infinity) - (b.classification.diffPct ?? Infinity) ||
      (a.stats.current?.price ?? Infinity) - (b.stats.current?.price ?? Infinity),
  );
}
