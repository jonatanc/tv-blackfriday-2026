// Funções puras de estatística de preço. Nenhuma faz I/O.

const TZ = "America/Sao_Paulo";
const STALE_HOURS = 36;
const DAY_MS = 86400e3;

export const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const pct = (from, to) => round(((to - from) / from) * 100, 1);

/** Data "YYYY-MM-DD" no fuso de São Paulo. */
export function brtDate(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Ofertas utilizáveis (ok, em estoque, com algum preço) de um modelo numa execução. */
export function usableOffers(run, modelId) {
  return (run.checks ?? [])
    .filter((c) => c.modelId === modelId && c.status === "ok" && c.offer?.inStock === true)
    .map((c) => {
      const o = c.offer;
      const price = o.pricePix ?? o.priceInstallments;
      return price == null
        ? null
        : {
            price,
            usedInstallments: o.pricePix == null,
            store: c.store,
            seller: o.seller ?? null,
            url: o.url,
            checkedAt: o.checkedAt,
            coupon: o.coupon ?? null,
            promoEndsAt: o.promoEndsAt ?? null,
            code: o.code ?? null,
          };
    })
    .filter(Boolean);
}

export function bestOffer(run, modelId) {
  const offers = usableOffers(run, modelId);
  return offers.length ? offers.reduce((a, b) => (b.price < a.price ? b : a)) : null;
}

export function validRuns(runs) {
  return runs
    .filter((r) => r.status !== "failed" && Array.isArray(r.checks) && r.checks.length > 0)
    .sort((a, b) => a.runId.localeCompare(b.runId));
}

export function modelStats(runs, modelId, now) {
  const bests = validRuns(runs)
    .map((r) => bestOffer(r, modelId))
    .filter(Boolean);

  const current = bests.at(-1) ?? null;
  const previous = bests.at(-2) ?? null;
  const empty = {
    current, previous, changeAbs: null, changePct: null, sysMin: null, sysMax: null,
    mean: null, min30: null, min90: null, savingsVsMeanPct: null, stale: false, runsWithOffer: 0,
  };
  if (!current) return empty;

  const point = (b) => ({ price: b.price, date: brtDate(b.checkedAt), store: b.store });
  // Em empate, a primeira ocorrência (mais antiga) é a que conta como recorde.
  const minB = bests.reduce((a, b) => (b.price < a.price ? b : a));
  const maxB = bests.reduce((a, b) => (b.price > a.price ? b : a));
  const mean = round(bests.reduce((s, b) => s + b.price, 0) / bests.length);
  const minWithin = (days) => {
    const inWindow = bests.filter((b) => now - new Date(b.checkedAt) <= days * DAY_MS);
    return inWindow.length ? Math.min(...inWindow.map((b) => b.price)) : null;
  };

  return {
    current,
    previous,
    changeAbs: previous ? round(current.price - previous.price) : null,
    changePct: previous ? pct(previous.price, current.price) : null,
    sysMin: point(minB),
    sysMax: point(maxB),
    mean,
    min30: minWithin(30),
    min90: minWithin(90),
    savingsVsMeanPct: round(((mean - current.price) / mean) * 100, 1),
    stale: now - new Date(current.checkedAt) > STALE_HOURS * 3600e3,
    runsWithOffer: bests.length,
  };
}

/** Menor preço por (dia BRT, loja), com marcação de nova mínima do modelo. */
export function dailySeries(runs, modelId) {
  const byKey = new Map();
  for (const run of validRuns(runs)) {
    for (const o of usableOffers(run, modelId)) {
      const date = brtDate(o.checkedAt);
      const key = `${date}|${o.store}`;
      const prev = byKey.get(key);
      if (!prev || o.price < prev.price) byKey.set(key, { date, store: o.store, price: o.price });
    }
  }
  const points = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.price - b.price);

  let priorMin = Infinity;
  let i = 0;
  while (i < points.length) {
    const date = points[i].date;
    const day = points.filter((p) => p.date === date);
    const dayMin = Math.min(...day.map((p) => p.price));
    for (const p of day) p.newMin = priorMin !== Infinity && p.price === dayMin && dayMin < priorMin;
    priorMin = Math.min(priorMin, dayMin);
    i += day.length;
  }
  return points;
}
