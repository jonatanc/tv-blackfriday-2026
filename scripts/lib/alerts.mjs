// Detecção de alertas da execução atual, com deduplicação por chave.
import { bestOffer, usableOffers, validRuns, round } from "./stats.mjs";

const DROP_PCT = 5;
const COUPON_PCT = 3;

export const alertKey = (type, modelId, store, price) => `${type}|${modelId}|${store}|${price}`;

const savings = (from, to) => (from ? round(((from - to) / from) * 100, 1) : null);

export function detectAlerts({ runs, run, models, external, existing }) {
  const seen = new Set(existing.map((a) => a.key));
  const earlier = validRuns(runs).filter((r) => r.runId < run.runId);
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

    // Compara com a última execução em que o modelo teve oferta (como o card faz).
    const prev = earlier.map((r) => bestOffer(r, id)).filter(Boolean).at(-1) ?? null;
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

export const ALERT_LABELS = {
  new_low: "Novo menor preço registrado",
  drop: "Queda de 5% ou mais",
  below_external: "No menor preço histórico externo",
  coupon: "Cupom com desconto relevante",
  promo_deadline: "Promoção com prazo de encerramento",
};

/** Alertas de `next` cuja chave não existe em `prev`. */
export function diffAlerts(prev, next) {
  const seen = new Set(prev.map((a) => a.key));
  return next.filter((a) => !seen.has(a.key));
}

const brl = (v) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/ /g, " ");
const brt = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).replace(",", "");

/** Título e corpo (markdown) da Issue do GitHub para um alerta. */
export function issueFor(alert, models) {
  const name = models.find((m) => m.id === alert.modelId)?.name ?? alert.modelId;
  const label = ALERT_LABELS[alert.type] ?? alert.type;
  const title = `[Alerta] ${name} — ${label} — ${brl(alert.newPrice)} na ${alert.store}`;
  const body = [
    `**Modelo:** ${name}`,
    `**Tipo:** ${label}`,
    `**Preço anterior:** ${brl(alert.previousPrice)}`,
    `**Preço novo:** ${brl(alert.newPrice)}`,
    `**Economia:** ${alert.savingsPct == null ? "—" : `${alert.savingsPct}%`}`,
    `**Loja:** ${alert.store}`,
    `**Horário:** ${brt(alert.at)} (Brasília)`,
    `**Link:** ${alert.url}`,
    // Texto vindo de páginas da web: um zero-width space depois do @ evita notificar usuários do GitHub.
    alert.note ? `\n${alert.note.replace(/@/g, "@​")}` : "",
    `\n<sub>chave: \`${alert.key}\`</sub>`,
  ].join("\n");
  return { title, body };
}
