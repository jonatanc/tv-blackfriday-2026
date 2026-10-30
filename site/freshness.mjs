// Recalcula, na hora da visualização, o que depende do relógio: se a rotina parar,
// data.json fica velho e não pode continuar dizendo que um preço é atual.

const STALE_HOURS = 36;

const isStale = (checkedAt, now) => checkedAt != null && now - new Date(checkedAt) > STALE_HOURS * 3600e3;

export function freshView(data, now) {
  const models = data.models.map((m) => {
    const stale = isStale(m.stats.current?.checkedAt, now);
    return {
      ...m,
      stats: { ...m.stats, stale },
      classification: stale ? { ...m.classification, level: "none" } : m.classification,
    };
  });
  const cheapestNow = data.cheapestNow
    ? { ...data.cheapestNow, stale: isStale(data.cheapestNow.checkedAt, now) }
    : null;
  return { ...data, models, cheapestNow, nextRuns: data.nextRuns.filter((iso) => new Date(iso) > now) };
}
