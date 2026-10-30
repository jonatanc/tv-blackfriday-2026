// Fixtures compartilhadas pelos testes. Valores escolhidos para que os
// resultados esperados possam ser calculados à mão (ver comentários).

export function makeRun(runId, checks, status = "ok", extra = {}) {
  const hour = runId.slice(11, 13);
  return {
    runId,
    startedAt: `${runId.slice(0, 10)}T${hour}:00:00-03:00`,
    finishedAt: `${runId.slice(0, 10)}T${hour}:20:00-03:00`,
    period: hour === "08" ? "manhã" : "noite",
    trigger: "scheduled",
    status,
    notes: "",
    checks,
    ...extra,
  };
}

export function offer(store, pricePix, checkedAt, extra = {}) {
  return {
    modelId: extra.modelId ?? "lg-c6",
    store,
    status: extra.status ?? "ok",
    reason: null,
    offer: {
      title: "Smart TV LG OLED evo C6 55\"",
      code: "OLED55C6PSA",
      seller: store,
      pricePix,
      priceInstallments: extra.priceInstallments ?? (pricePix ? Math.round(pricePix * 1.1) : null),
      installments: 10,
      shipping: 0,
      inStock: extra.inStock ?? true,
      coupon: extra.coupon ?? null,
      promoEndsAt: extra.promoEndsAt ?? null,
      warranty: "12 meses fabricante",
      url: `https://www.${store}.com.br/p/oled55c6`,
      linkCheck: { httpStatus: 200, codeMatched: true },
      checkedAt,
    },
  };
}

// Melhor preço por execução válida de lg-c6:
// r1 10000 (amazon) | r2 9000 (magalu, parcelado) | r3 failed | r4 7900 (magalu)
// r5 8500 (amazon, 22:30 BRT) | r6 8600 (amazon; magalu sem estoque) | r7 8400 (amazon)
// min 7900 · max 10000 · média 52400/6 = 8733.33
export const runs = [
  makeRun("2026-10-30T20", [
    offer("amazon", 10000, "2026-10-30T20:05:00-03:00"),
    offer("magalu", 10200, "2026-10-30T20:06:00-03:00"),
    { modelId: "tcl-c6k", store: "amazon", status: "not_found", reason: "sem anúncio 55C6K" },
  ]),
  makeRun("2026-10-31T08", [
    offer("amazon", 9800, "2026-10-31T08:05:00-03:00"),
    offer("magalu", null, "2026-10-31T08:06:00-03:00", { priceInstallments: 9000 }),
  ]),
  makeRun("2026-10-31T20", [], "failed", { notes: "erro de rede" }),
  makeRun("2026-11-01T08", [
    offer("amazon", 9500, "2026-11-01T08:05:00-03:00"),
    offer("magalu", 8000, "2026-11-01T08:06:00-03:00"),
    offer("magalu", 7900, "2026-11-01T08:07:00-03:00"),
  ]),
  makeRun("2026-11-01T20", [
    offer("amazon", 8500, "2026-11-01T22:30:00-03:00"),
  ]),
  makeRun("2026-11-02T08", [
    offer("amazon", 8600, "2026-11-02T08:05:00-03:00"),
    offer("magalu", 7000, "2026-11-02T08:06:00-03:00", { status: "out_of_stock", inStock: false }),
  ]),
  makeRun("2026-11-02T20", [
    offer("amazon", 8400, "2026-11-02T20:05:00-03:00"),
  ]),
];

export const LAST_CHECK = new Date("2026-11-02T20:05:00-03:00");
export const hoursAfter = (date, h) => new Date(date.getTime() + h * 3600e3);
