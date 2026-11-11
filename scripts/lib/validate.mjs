// Validação de esquema de um snapshot de execução (data/runs/<runId>.json).

export const MODEL_IDS = ["lg-c6", "sam-s85f", "sam-s85h", "tcl-c6k", "brastemp-bfs5gdr"];
export const STORE_IDS = ["amazon", "magalu", "casasbahia", "fastshop", "kabum", "carrefour", "mercadolivre", "lg", "samsung", "tcl", "brastemp"];
const RUN_STATUS = ["ok", "partial", "failed"];
const TRIGGERS = ["scheduled", "manual", "initial"];
const CHECK_STATUS = ["ok", "out_of_stock", "not_found", "not_queryable", "rejected"];
const WITH_OFFER = ["ok", "out_of_stock"];
const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)$/;

const priceOk = (v) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0);

export function validateRun(run) {
  const errs = [];
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(run?.runId ?? "")) errs.push(`runId inválido: ${run?.runId}`);
  if (!RUN_STATUS.includes(run?.status)) errs.push(`status inválido: ${run?.status}`);
  if (!TRIGGERS.includes(run?.trigger)) errs.push(`trigger inválido: ${run?.trigger}`);
  if (!Array.isArray(run?.checks)) return [...errs, "checks deve ser um array"];

  run.checks.forEach((c, i) => {
    const at = `checks[${i}]`;
    if (!MODEL_IDS.includes(c.modelId)) errs.push(`${at}.modelId inválido: ${c.modelId}`);
    if (!STORE_IDS.includes(c.store)) errs.push(`${at}.store inválido: ${c.store}`);
    if (!CHECK_STATUS.includes(c.status)) errs.push(`${at}.status inválido: ${c.status}`);
    const needsOffer = WITH_OFFER.includes(c.status);
    if (needsOffer && !c.offer) errs.push(`${at}: status ${c.status} exige offer`);
    if (!needsOffer && c.offer) errs.push(`${at}: status ${c.status} não pode ter offer`);
    if (!needsOffer || !c.offer) return;

    const o = c.offer;
    if (!priceOk(o.pricePix)) errs.push(`${at}.offer.pricePix inválido: ${o.pricePix}`);
    if (!priceOk(o.priceInstallments)) errs.push(`${at}.offer.priceInstallments inválido: ${o.priceInstallments}`);
    if (c.status === "ok" && o.pricePix == null && o.priceInstallments == null) errs.push(`${at}: oferta ok sem nenhum preço`);
    if (typeof o.url !== "string" || !o.url.startsWith("https://")) errs.push(`${at}.offer.url deve começar com https://`);
    if (!ISO_OFFSET.test(o.checkedAt ?? "")) errs.push(`${at}.offer.checkedAt deve ser ISO com fuso: ${o.checkedAt}`);
    if (typeof o.inStock !== "boolean") errs.push(`${at}.offer.inStock deve ser booleano`);
  });
  return errs;
}
