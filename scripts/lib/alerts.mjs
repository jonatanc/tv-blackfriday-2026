// Detecção de alertas da execução atual, com deduplicação por chave.
import { bestOffer, usableOffers, validRuns, round } from "./stats.mjs";

const DROP_PCT = 5;
const COUPON_PCT = 3;

export const alertKey = (type, modelId, store, price) => `${type}|${modelId}|${store}|${price}`;

const savings = (from, to) => (from ? round(((from - to) / from) * 100, 1) : null);

export function detectAlerts({ runs, run, models, external, existing }) {
  const seen = new Set(existing.map((a) => a.key));
  const earlier = validRuns(runs).filter((r) => r.runId < run.runId);
  const prevRun = earlier.at(-1);
  const out = [];

  const push = (type, modelId, o, previousPrice, note) => {
    const key = alertKey(type, modelId, o.store, o.price);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      key, type, modelId, store: o.store, previousPrice, newPrice: o.price,
      savingsPct: savings(previousPrice, o.price), at: o.checkedAt, url: o.url, note,
    });
  };

  for (const { id } of models) {
    const cur = bestOffer(run, id);
    if (!cur) continue;

    const priorPrices = earlier.map((r) => bestOffer(r, id)?.price).filter((p) => p != null);
    const priorMin = priorPrices.length ? Math.min(...priorPrices) : null;
    if (priorMin != null && cur.price < priorMin) push("new_low", id, cur, priorMin, "Novo menor preço registrado");

    const prev = prevRun ? bestOffer(prevRun, id) : null;
    if (prev && savings(prev.price, cur.price) >= DROP_PCT) {
      push("drop", id, cur, prev.price, `Queda de ${savings(prev.price, cur.price)}% desde a consulta anterior`);
    }

    const ext = external?.[id];
    if (ext?.verified && typeof ext.lowest === "number" && cur.price <= ext.lowest) {
      push("below_external", id, cur, ext.lowest, `No ou abaixo do menor histórico externo (${ext.source ?? "fonte"})`);
    }

    for (const o of usableOffers(run, id)) {
      if (o.coupon?.discountPct >= COUPON_PCT) {
        push("coupon", id, o, null, `Cupom ${o.coupon.code ?? ""}: ${o.coupon.description ?? ""}`.trim());
      }
      if (o.promoEndsAt) push("promo_deadline", id, o, null, `Promoção termina em ${o.promoEndsAt}`);
    }
  }
  return out;
}
