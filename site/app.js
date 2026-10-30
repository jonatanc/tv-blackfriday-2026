// Dashboard: lê data.json (gerado por scripts/aggregate.mjs) e renderiza tudo.
// Todo texto vindo dos dados entra via textContent.
"use strict";

const TZ = "America/Sao_Paulo";
const REFRESH_MS = 10 * 60 * 1000;
const STORE_NAMES = {
  amazon: "Amazon", magalu: "Magazine Luiza", casasbahia: "Casas Bahia", fastshop: "Fast Shop",
  kabum: "KaBuM!", carrefour: "Carrefour", mercadolivre: "Mercado Livre",
  lg: "Loja oficial LG", samsung: "Loja oficial Samsung", tcl: "Loja oficial TCL",
};
// Cor segue a entidade (posição fixa); lojas oficiais compartilham o slot 8.
const STORE_SLOT = { amazon: 1, magalu: 2, casasbahia: 3, fastshop: 4, kabum: 5, carrefour: 6, mercadolivre: 7, lg: 8, samsung: 8, tcl: 8 };
const MODEL_SLOT = { "lg-c6": 1, "sam-s85f": 2, "sam-s85h": 3, "tcl-c6k": 4 };
const LEVELS = {
  excellent: "🟢 Excelente oportunidade", good: "🟡 Boa oportunidade",
  wait: "🔴 Aguardar", none: "⚪ Sem histórico suficiente",
};
const STATUS = {
  ok: "Em estoque", out_of_stock: "Sem estoque", not_found: "Não encontrado",
  not_queryable: "Não consultável", rejected: "Descartado",
};
const RUN_STATUS = { ok: "✔ OK", partial: "◐ Parcial", failed: "✖ Falhou" };
const ALERT_TYPES = {
  new_low: "Novo menor preço", drop: "Queda de 5% ou mais", below_external: "No menor preço histórico",
  coupon: "Cupom", promo_deadline: "Promoção com prazo",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (v) => (v == null ? "—" : brl.format(v));
const pctFmt = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR")}%`);
const dt = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—");
const dayLabel = (ymd) => ymd.slice(8, 10) + "/" + ymd.slice(5, 7);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const seriesColor = (slot) => cssVar(`--s${slot}`);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const safeUrl = (u) => (typeof u === "string" && u.startsWith("https://") ? u : null);
const offerLink = (url, text = "Ver oferta", cls = "btn") =>
  safeUrl(url)
    ? h("a", { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" }, text)
    : h("span", { class: cls, "aria-disabled": "true" }, "Sem oferta");

let DATA = null;
let range = "all";
let selectedModel = null;
const charts = {};

async function load() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
    render();
  } catch (e) {
    document.getElementById("meta").replaceChildren(h("span", {}, `Não foi possível carregar os dados (${e.message}). Nova tentativa em 10 minutos.`));
  }
}

function modelById(id) { return DATA.models.find((m) => m.id === id); }

function render() {
  renderMeta();
  renderHero();
  renderCards();
  renderRanking();
  renderModelSelect();
  renderCharts();
  renderStoresTable();
  renderAlerts();
  renderRuns();
}

function renderMeta() {
  const end = new Date(DATA.endsAt);
  const days = Math.max(0, Math.ceil((end - new Date()) / 86400e3));
  const lr = DATA.lastRun;
  document.getElementById("meta").replaceChildren(
    h("span", {}, "Última atualização: ", h("strong", {}, dt(lr?.finishedAt ?? DATA.generatedAt))),
    lr ? h("span", { class: "pill" }, `Última coleta ${lr.runId.replace("T", " ")}h · ${RUN_STATUS[lr.status] ?? lr.status}`) : h("span", { class: "pill" }, "Aguardando a primeira coleta"),
    h("span", {}, "Próximas consultas: ", h("strong", {}, DATA.nextRuns.length ? DATA.nextRuns.map(dt).join(" · ") : "monitoramento encerrado")),
    h("span", {}, days > 0 ? `Faltam ${days} dia${days > 1 ? "s" : ""} para a Black Friday (27/11)` : "Black Friday: 27/11/2026"),
  );
}

function renderHero() {
  const c = DATA.cheapestNow;
  const el = document.getElementById("hero");
  if (!c) {
    el.replaceChildren(h("div", {}, h("div", { class: "label" }, "Mais barata agora"), h("div", { class: "name" }, "Nenhuma oferta confirmada ainda")));
    return;
  }
  const m = modelById(c.modelId);
  el.replaceChildren(
    h("div", {},
      h("div", { class: "label" }, "Mais barata agora"),
      h("div", { class: "name" }, m.name),
      h("div", { class: "note" }, `${STORE_NAMES[c.store] ?? c.store} · consultado em ${dt(c.checkedAt)}${c.usedInstallments ? " · preço parcelado" : " · à vista no Pix"}`)),
    h("div", { class: "price" }, money(c.price)),
    offerLink(c.url),
  );
}

function changeEl(stats) {
  if (stats.changePct == null) return "—";
  const cls = stats.changeAbs < 0 ? "down" : stats.changeAbs > 0 ? "up" : "";
  const arrow = stats.changeAbs < 0 ? "▼ " : stats.changeAbs > 0 ? "▲ " : "";
  return h("span", { class: cls }, `${arrow}${money(Math.abs(stats.changeAbs))} (${pctFmt(stats.changePct)})`);
}

function externalText(ext) {
  if (!ext?.verified) return ext?.label ?? "Histórico externo não verificado";
  const date = ext.date ? `, ${ext.dateApprox ? "≈ " : ""}${new Date(ext.date + "T12:00:00-03:00").toLocaleDateString("pt-BR")}` : "";
  return `${money(ext.lowest)} · ${ext.source}${date}${ext.note ? " ⓘ" : ""}`;
}

function renderCards() {
  const cards = DATA.models.map((m) => {
    const s = m.stats;
    const cur = s.current;
    const initials = (m.brand ?? m.name).slice(0, 3).toUpperCase();
    const img = m.image ? h("img", { src: m.image, alt: m.name, loading: "lazy", referrerpolicy: "no-referrer" }) : initials;
    const imgBox = h("div", { class: "img" }, img);
    if (m.image) imgBox.firstChild.addEventListener("error", () => imgBox.replaceChildren(initials));
    const extLink = m.external?.verified && safeUrl(m.external.sourceUrl)
      ? h("a", { href: m.external.sourceUrl, target: "_blank", rel: "noopener noreferrer", title: m.external.note ?? null }, externalText(m.external))
      : externalText(m.external);
    return h("article", { class: "card" },
      imgBox,
      h("h3", {}, m.name),
      h("div", { class: "code" }, (m.fullCodes ?? [m.baseCode ?? m.id]).join(" · ")),
      h("div", { class: "flags" },
        h("span", { class: `badge ${m.classification.level}` }, LEVELS[m.classification.level]),
        s.stale ? h("span", { class: "badge stale" }, "⚠ Preço desatualizado") : null,
        cur?.usedInstallments ? h("span", { class: "badge none" }, "Pago no parcelado") : null),
      h("div", { class: "price" }, cur ? money(cur.price) : "Sem oferta encontrada"),
      h("div", { class: "note" }, cur ? `${STORE_NAMES[cur.store] ?? cur.store}${cur.seller && cur.seller !== cur.store ? " · vendido por " + cur.seller : ""}` : "Nenhuma loja com oferta válida na última coleta"),
      h("dl", {},
        h("dt", {}, "Variação desde a última consulta"), h("dd", {}, changeEl(s)),
        h("dt", {}, "Menor histórico externo"), h("dd", {}, extLink),
        h("dt", {}, "Menor registrado pelo sistema"), h("dd", {}, s.sysMin ? `${money(s.sysMin.price)} (${dayLabel(s.sysMin.date)})` : "—"),
        h("dt", {}, "Menor 30 dias / 90 dias"), h("dd", {}, `${money(s.min30)} / ${money(s.min90)}`),
        h("dt", {}, "Preço médio observado"), h("dd", {}, money(s.mean)),
        h("dt", {}, "Economia vs. média"), h("dd", {}, pctFmt(s.savingsVsMeanPct)),
        h("dt", {}, "Diferença vs. menor histórico externo"),
        h("dd", {}, m.external?.verified && cur ? pctFmt(Math.round(((cur.price - m.external.lowest) / m.external.lowest) * 1000) / 10) : "—")),
      offerLink(cur?.url),
    );
  });
  document.getElementById("cards").replaceChildren(...cards);
}

function renderRanking() {
  const items = DATA.ranking.map((id) => {
    const m = modelById(id);
    const c = m.classification;
    const detail = m.stats.current
      ? `${money(m.stats.current.price)} na ${STORE_NAMES[m.stats.current.store] ?? m.stats.current.store}` +
        (c.reference != null ? ` · referência ${money(c.reference)} (${pctFmt(c.diffPct)})` : "")
      : "Sem oferta válida";
    return h("li", {}, h("strong", {}, m.name), h("span", { class: `badge ${c.level}` }, LEVELS[c.level]), h("span", { class: "detail" }, detail));
  });
  document.getElementById("ranking").replaceChildren(...items);
}

function renderModelSelect() {
  const sel = document.getElementById("model-select");
  if (!selectedModel || !modelById(selectedModel)) selectedModel = DATA.cheapestNow?.modelId ?? DATA.models[0]?.id;
  sel.replaceChildren(...DATA.models.map((m) => h("option", { value: m.id, selected: m.id === selectedModel }, m.name)));
}

function todayBrt() { return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); }
function inRange(ymd) {
  if (range === "all") return true;
  const cutoff = new Date(todayBrt() + "T00:00:00-03:00").getTime() - (Number(range) - 1) * 86400e3;
  return new Date(ymd + "T00:00:00-03:00").getTime() >= cutoff;
}

function chartOptions() {
  const ink2 = cssVar("--ink-2");
  const grid = cssVar("--grid");
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom", labels: { color: ink2, usePointStyle: true, boxWidth: 8, filter: (i) => !i.text.startsWith("_") } },
      tooltip: {
        filter: (i) => !i.dataset.label.startsWith("_") && i.parsed.y != null,
        itemSort: (a, b) => a.parsed.y - b.parsed.y,
        callbacks: { label: (i) => ` ${i.dataset.label}: ${money(i.parsed.y)}` },
      },
    },
    scales: {
      x: { ticks: { color: ink2 }, grid: { display: false }, border: { color: cssVar("--axis") } },
      y: { ticks: { color: ink2, callback: (v) => brl.format(v).replace(",00", "") }, grid: { color: grid }, border: { display: false } },
    },
    elements: { line: { borderWidth: 2, tension: 0 }, point: { radius: 3, hoverRadius: 6, hitRadius: 12 } },
    spanGaps: true,
  };
}

function lineDataset(label, color, data, extra = {}) {
  return { label, data, borderColor: color, backgroundColor: color, pointBorderColor: cssVar("--surface"), pointBorderWidth: 2, ...extra };
}

function drawChart(key, canvasId, labels, datasets) {
  if (typeof Chart === "undefined") return;
  const canvas = document.getElementById(canvasId);
  charts[key]?.destroy();
  const box = canvas.parentElement;
  box.querySelector(".empty")?.remove();
  if (!labels.length) {
    canvas.style.display = "none";
    box.append(h("div", { class: "empty" }, "Ainda não há dados neste período."));
    return;
  }
  canvas.style.display = "";
  charts[key] = new Chart(canvas, { type: "line", data: { labels, datasets }, options: chartOptions() });
}

function renderCharts() {
  // 1) Melhor preço do dia por TV
  const allDates = [...new Set(DATA.models.flatMap((m) => m.series.map((p) => p.date)))].filter(inRange).sort();
  const modelSets = DATA.models
    .filter((m) => m.series.length)
    .map((m) => {
      const byDate = new Map();
      for (const p of m.series) if (!byDate.has(p.date) || p.price < byDate.get(p.date)) byDate.set(p.date, p.price);
      return lineDataset(m.name, seriesColor(MODEL_SLOT[m.id] ?? 1), allDates.map((d) => byDate.get(d) ?? null));
    });
  drawChart("models", "chart-models", allDates.map(dayLabel), modelSets);

  // 2) Comparação entre lojas da TV selecionada
  const m = modelById(selectedModel);
  const pts = (m?.series ?? []).filter((p) => inRange(p.date));
  const dates = [...new Set(pts.map((p) => p.date))].sort();
  const stores = [...new Set(pts.map((p) => p.store))].sort((a, b) => STORE_SLOT[a] - STORE_SLOT[b]);
  const surface = cssVar("--surface");
  const storeSets = stores.map((st) => {
    const color = seriesColor(STORE_SLOT[st] ?? 8);
    const data = dates.map((d) => pts.find((p) => p.date === d && p.store === st)?.price ?? null);
    const isMin = dates.map((d) => pts.find((p) => p.date === d && p.store === st)?.newMin === true);
    return lineDataset(STORE_NAMES[st] ?? st, color, data, {
      pointRadius: isMin.map((b) => (b ? 7 : 3)),
      pointBorderWidth: isMin.map((b) => (b ? 3 : 2)),
      pointBorderColor: isMin.map((b) => (b ? cssVar("--ink") : surface)),
    });
  });
  const prices = pts.map((p) => p.price);
  const statsEl = document.getElementById("model-stats");
  if (prices.length) {
    const min = Math.min(...prices), max = Math.max(...prices);
    const mean = Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;
    const first = pts[0].price, last = pts.at(-1).price;
    const muted = cssVar("--muted");
    const ref = (label, v) => lineDataset(`_${label}`, muted, dates.map(() => v), { borderDash: [4, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 0 });
    storeSets.push(ref("min", min), ref("média", mean), ref("max", max));
    statsEl.replaceChildren(
      stat("Mínimo no período", money(min)), stat("Máximo no período", money(max)),
      stat("Média no período", money(mean)), stat("Variação no período", pctFmt(Math.round(((last - first) / first) * 1000) / 10)),
      stat("Novas mínimas", String(pts.filter((p) => p.newMin).length)),
    );
  } else {
    statsEl.replaceChildren();
  }
  drawChart("stores", "chart-stores", dates.map(dayLabel), storeSets);
}

function stat(k, v) { return h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)); }

function renderStoresTable() {
  const m = modelById(selectedModel);
  const rows = (m?.latestChecks ?? []).map((c) => {
    const o = c.offer;
    return h("tr", {},
      h("td", {}, h("span", { class: "swatch", style: `background:${seriesColor(STORE_SLOT[c.store] ?? 8)}` }), STORE_NAMES[c.store] ?? c.store, o?.seller ? h("div", { class: "note" }, o.seller) : null),
      h("td", {}, STATUS[c.status] ?? c.status, c.reason ? h("div", { class: "note" }, c.reason) : null),
      h("td", { class: "num" }, money(o?.pricePix)),
      h("td", { class: "num" }, o?.priceInstallments != null ? `${money(o.priceInstallments)}${o.installments ? ` em ${o.installments}x` : ""}` : "—"),
      h("td", {}, o?.shipping == null ? "—" : o.shipping === 0 ? "Grátis" : money(o.shipping)),
      h("td", {}, o?.coupon ? `${o.coupon.code ?? ""} ${o.coupon.description ?? ""}`.trim() : "—"),
      h("td", {}, o?.warranty ?? "—"),
      h("td", {}, o ? offerLink(o.url, "Abrir", "") : ""),
    );
  });
  const tbody = document.querySelector("#stores-table tbody");
  tbody.replaceChildren(...(rows.length ? rows : [h("tr", {}, h("td", { colspan: "8", class: "empty" }, "Nenhuma consulta registrada para esta TV."))]));
}

function renderAlerts() {
  const items = DATA.alerts.map((a) => {
    const m = modelById(a.modelId);
    return h("li", {},
      h("strong", {}, `${ALERT_TYPES[a.type] ?? a.type} · ${m?.name ?? a.modelId}`),
      h("div", {}, `${a.previousPrice != null ? money(a.previousPrice) + " → " : ""}${money(a.newPrice)}${a.savingsPct != null ? ` (economia ${a.savingsPct.toLocaleString("pt-BR")}%)` : ""} · ${STORE_NAMES[a.store] ?? a.store}`),
      a.note ? h("div", { class: "note" }, a.note) : null,
      h("div", { class: "when" }, dt(a.at), " · ", offerLink(a.url, "Ver oferta", "")),
    );
  });
  document.getElementById("alerts").replaceChildren(...(items.length ? items : [h("li", { class: "note" }, "Nenhum alerta até agora.")]));
}

function renderRuns() {
  const rows = DATA.runsLog.map((r) => h("tr", {},
    h("td", {}, r.runId.replace("T", " ") + "h", r.trigger !== "scheduled" ? h("div", { class: "note" }, r.trigger === "initial" ? "coleta inicial" : "manual") : null),
    h("td", {}, RUN_STATUS[r.status] ?? r.status),
    h("td", { class: "num" }, String(r.okCount)),
    h("td", { class: "num" }, String(r.notQueryable)),
    h("td", {}, r.notes || "—")));
  document.querySelector("#runs-table tbody").replaceChildren(...(rows.length ? rows : [h("tr", {}, h("td", { colspan: "5", class: "empty" }, "Nenhuma execução registrada ainda."))]));
}

document.querySelector(".filters").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn || !DATA) return;
  range = btn.dataset.range;
  for (const b of document.querySelectorAll(".filters button")) b.setAttribute("aria-pressed", String(b === btn));
  renderCharts();
});
document.getElementById("model-select").addEventListener("change", (e) => {
  selectedModel = e.target.value;
  renderCharts();
  renderStoresTable();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => DATA && renderCharts());

load();
setInterval(load, REFRESH_MS);
