// Monta o data.json do dashboard a partir de modelos, histórico externo e execuções.
import { brtDate, dailySeries, modelStats, validRuns } from "./stats.mjs";
import { classify, rankModels } from "./rank.mjs";
import { detectAlerts } from "./alerts.mjs";

export const ENDS_AT = "2026-11-27T23:59:00-03:00";
const RUN_HOURS = ["08", "20"];
const MAX_ALERTS = 50;

/** Próximos (até dois) horários de coleta 08h/20h BRT depois de `now`, até ENDS_AT. */
export function nextRuns(now) {
  const end = new Date(ENDS_AT);
  const out = [];
  const [y, m, d] = brtDate(now.toISOString()).split("-").map(Number);
  for (let offset = 0; offset < 3 && out.length < 2; offset++) {
    const day = new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
    for (const h of RUN_HOURS) {
      const iso = `${day}T${h}:00:00-03:00`;
      const t = new Date(iso);
      if (t > now && t <= end && out.length < 2) out.push(iso);
    }
  }
  return out;
}

export function buildDashboard({ models, external, runs, alerts, now }) {
  const sorted = [...runs].sort((a, b) => a.runId.localeCompare(b.runId));
  const valid = validRuns(sorted);
  const latestValid = valid.at(-1);
  const last = sorted.at(-1);

  const newAlerts = latestValid
    ? detectAlerts({ runs: sorted, run: latestValid, models, external, existing: alerts })
    : [];
  const allAlerts = [...alerts, ...newAlerts]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, MAX_ALERTS);

  const entries = models.map((model) => {
    const stats = modelStats(sorted, model.id, now);
    const ext = external[model.id] ?? { verified: false, label: "Histórico externo não verificado" };
    const lastWithModel = [...valid].reverse().find((r) => r.checks.some((c) => c.modelId === model.id));
    return {
      ...model,
      category: model.category ?? "tv",
      modelId: model.id,
      external: ext,
      stats,
      classification: classify(stats, ext),
      series: dailySeries(sorted, model.id),
      latestChecks: lastWithModel ? lastWithModel.checks.filter((c) => c.modelId === model.id) : [],
    };
  });

  // "Mais barata agora" e o ranking comparam só TVs entre si; outras categorias têm seção própria.
  const tvs = entries.filter((e) => e.category === "tv");
  const withPrice = tvs.filter((e) => e.stats.current);
  const cheapest = withPrice.length
    ? withPrice.reduce((a, b) => (b.stats.current.price < a.stats.current.price ? b : a))
    : null;

  const data = {
    generatedAt: now.toISOString(),
    lastRun: last
      ? { runId: last.runId, status: last.status, finishedAt: last.finishedAt ?? null, period: last.period ?? null }
      : null,
    nextRuns: nextRuns(now),
    endsAt: ENDS_AT,
    cheapestNow: cheapest ? { modelId: cheapest.id, ...cheapest.stats.current } : null,
    models: entries,
    ranking: rankModels(tvs).map((e) => e.id),
    alerts: allAlerts,
    runsLog: [...sorted].reverse().map((r) => ({
      runId: r.runId,
      status: r.status,
      trigger: r.trigger,
      okCount: r.checks.filter((c) => c.status === "ok").length,
      notQueryable: r.checks.filter((c) => c.status === "not_queryable").length,
      notes: r.notes ?? "",
    })),
  };
  return { data, newAlerts };
}
