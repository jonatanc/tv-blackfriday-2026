# Monitor de preços TVs 55" — Black Friday 2026 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard público no GitHub Pages (jonatanc) alimentado por uma rotina Claude na nuvem que coleta preços de 4 TVs às 08h/20h BRT até 27/11/2026.

**Architecture:** Repositório = banco (snapshots JSON por execução). Funções puras em `scripts/lib/` calculam estatísticas, ranking e alertas; `scripts/aggregate.mjs` gera `site/data.json`; site estático lê esse JSON. A rotina na nuvem segue `ROUTINE_PROMPT.md`, coleta, valida, agrega, testa e faz push; um workflow publica `site/` no Pages.

**Tech Stack:** Node 22 (ESM, `node:test`, zero deps), HTML/CSS/JS puro, Chart.js 4.4.1 via cdnjs, GitHub Pages + Actions, Claude routine (RemoteTrigger).

**Spec:** `docs/superpowers/specs/2026-10-30-monitor-tvs-55-black-friday-design.md`

## Global Constraints

- Fuso de todas as datas exibidas/agrupadas: `America/Sao_Paulo` (offset fixo `-03:00`).
- Cron: `0 11,23 * * *` UTC. Fim: `2026-11-27T23:59:00-03:00`.
- Nunca inventar preço: campo desconhecido = `null`; sem histórico externo = `{ "verified": false, "label": "Histórico externo não verificado" }`.
- Oferta stale: `checkedAt` mais de **36 h** antes de `now`.
- Classificação: 🟢 `excellent` atual ≤ ref; 🟡 `good` ≤ ref × **1.05**; 🔴 `wait` acima; ⚪ `none` se não há externo verificado E < **6** execuções com oferta.
- Alertas: queda ≥ **5%**; cupom ≥ **3%**; chave de dedupe `tipo|modelId|store|price`.
- Lojas (ids): `amazon, magalu, casasbahia, fastshop, kabum, carrefour, mercadolivre, lg, samsung, tcl`.
- Modelos (ids): `lg-c6, sam-s85f, sam-s85h, tcl-c6k`.
- Sem dependências npm. Nenhum token/credencial em `site/`.
- Repositório público `jonatanc/tv-blackfriday-2026`; URL `https://jonatanc.github.io/tv-blackfriday-2026/`.

## Review Focus

1. Oferta checada às 21h–23h59 BRT cai no dia seguinte em UTC → agrupamento diário deve usar data BRT (teste em Task 1).
2. `pricePix` nulo mas parcelado presente → usar parcelado e marcar `usedInstallments: true` (Task 1).
3. Modelo sem nenhuma oferta em nenhuma execução → card mostra “Sem oferta encontrada”, stats `null`, classe `none`, sem exceção (Tasks 1, 2, 4).
4. Mesma loja aparecendo 2× na mesma execução (vendedores diferentes) → considerar a menor, sem duplicar ponto no gráfico (Task 1).
5. Execução `failed` sem `checks` → não conta como “execução anterior” para variação/queda (Tasks 1, 2).

---

### Task 1: Estatísticas puras

**Files:**
- Create: `package.json` (`{"type":"module","scripts":{"test":"node --test"}}`), `.gitattributes` (`* text=auto eol=lf`), `scripts/lib/stats.mjs`, `test/fixtures/runs.mjs`, `test/stats.test.mjs`

**Interfaces:**
- Produces:
  - `brtDate(iso: string) -> "YYYY-MM-DD"` (data em America/Sao_Paulo)
  - `bestOffer(run, modelId) -> {price, usedInstallments, store, seller, url, checkedAt, coupon, promoEndsAt} | null` — só checks `status:"ok"` com `offer.inStock === true`; preço = `pricePix ?? priceInstallments`.
  - `validRuns(runs) -> runs` — ordenadas por `runId`, exclui `status:"failed"` e runs sem `checks`.
  - `modelStats(runs, modelId, now: Date) -> {current, previous, changeAbs, changePct, sysMin:{price,date,store}|null, sysMax:{...}|null, mean, min30, min90, savingsVsMeanPct, stale, runsWithOffer}` — `current`/`previous` são saídas de `bestOffer` das duas últimas runs válidas em que o modelo teve oferta; `mean` = média dos `bestOffer.price` por run; arredondar % a 1 casa.
  - `dailySeries(runs, modelId) -> Array<{date, store, price, newMin: boolean}>` — menor preço por (data BRT, loja); `newMin` quando o preço é estritamente menor que todo preço anterior do modelo.

- [ ] **Step 1: Fixture** — `test/fixtures/runs.mjs` exporta `makeRun(runId, checks, status="ok")` e `runs` com 7 execuções para `lg-c6` (amazon/magalu), incluindo: uma run `failed` sem checks; uma oferta `pricePix:null, priceInstallments:9000`; duas ofertas `magalu` na mesma run (8000 e 7900); uma oferta `checkedAt:"2026-11-01T22:30:00-03:00"`; nenhuma oferta para `tcl-c6k`.
- [ ] **Step 2: Testes** em `test/stats.test.mjs`:
  - `brtDate("2026-11-01T22:30:00-03:00") === "2026-11-01"` e `brtDate("2026-11-02T01:30:00Z") === "2026-11-01"`.
  - `bestOffer` usa 9000 com `usedInstallments:true` quando Pix é null; escolhe 7900 entre as duas magalu.
  - `validRuns` exclui a run failed.
  - `modelStats(runs,"tcl-c6k",now)` → `current:null, sysMin:null, runsWithOffer:0`, sem throw.
  - `modelStats` de `lg-c6`: `sysMin.price`, `changePct`, `mean` com os valores da fixture; `stale:true` quando `now` = último `checkedAt` + 37 h, `false` com +35 h.
  - `dailySeries` não tem duas entradas com mesmo `(date, store)` e marca `newMin` só nas quedas abaixo do mínimo anterior.
- [ ] **Step 3:** `npm test` → FAIL (módulo inexistente).
- [ ] **Step 4:** Implementar `scripts/lib/stats.mjs`. `brtDate`: `new Date(iso).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"})`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** `git add -A && git commit -m "feat: estatísticas de preço por modelo"`

### Task 2: Classificação e alertas

**Files:**
- Create: `scripts/lib/rank.mjs`, `scripts/lib/alerts.mjs`, `test/rank.test.mjs`, `test/alerts.test.mjs`

**Interfaces:**
- Consumes: `modelStats`, `bestOffer`, `validRuns` (Task 1).
- Produces:
  - `classify(stats, external) -> {level:"excellent"|"good"|"wait"|"none", reference:number|null, diffPct:number|null}` — `reference = min(external.lowest se verified, stats.sysMin.price)`; `none` se `stats.current` nulo, ou (externo não verificado e `runsWithOffer < 6`).
  - `rankModels(entries: Array<{modelId, stats, classification}>) -> same[]` — ordem: excellent, good, wait, none; empate por `diffPct` asc, depois preço asc.
  - `detectAlerts({runs, run, models, external, existing}) -> Alert[]` onde `Alert = {key, type:"new_low"|"drop"|"below_external"|"coupon"|"promo_deadline", modelId, store, previousPrice, newPrice, savingsPct, at, url, note}`. `run` é a execução atual (última de `runs`); comparação com a run válida anterior. `coupon`: oferta com `coupon` cujo `coupon.discountPct ≥ 3` (forma do cupom: `{code, description, discountPct|null}`). `promo_deadline`: `offer.promoEndsAt` não nulo. Exclui alertas cuja `key` já está em `existing`.
  - `alertKey(type, modelId, store, price) -> string`.

- [ ] **Step 1: Testes** `rank.test.mjs`: externo verificado 7000, atual 7000 → excellent; 7350 → good (=1.05); 7351 → wait; externo não verificado e 5 runs → none; 6 runs, sysMin 8000, atual 8000 → excellent; `current:null` → none. `rankModels` ordena conforme acima.
- [ ] **Step 2: Testes** `alerts.test.mjs`: queda de 10000→9400 (6%) gera `drop` e `new_low`; 10000→9600 (4%) não gera `drop`; atual ≤ externo verificado gera `below_external`; cupom 2% não gera, 3% gera; `promoEndsAt` gera `promo_deadline`; rodar `detectAlerts` duas vezes passando os alertas da primeira em `existing` → segunda retorna `[]`; run anterior `failed` é ignorada na comparação.
- [ ] **Step 3:** `npm test` → FAIL.
- [ ] **Step 4:** Implementar `rank.mjs` e `alerts.mjs`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** `git commit -m "feat: classificação de oportunidade e alertas"`

### Task 3: Validação de snapshot e agregador CLI

**Files:**
- Create: `scripts/validate.mjs`, `scripts/aggregate.mjs`, `scripts/lib/build.mjs`, `test/validate.test.mjs`, `test/build.test.mjs`, `data/runs/.gitkeep`, `data/alerts.json` (`[]`)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `validateRun(obj) -> string[]` (vazio = válido). Regras: `runId` casa `^\d{4}-\d{2}-\d{2}T\d{2}$`; `status ∈ {ok,partial,failed}`; `trigger ∈ {scheduled,manual,initial}`; cada check tem `modelId` e `store` dos ids globais e `status ∈ {ok,out_of_stock,not_found,not_queryable,rejected}`; `offer` obrigatório em ok/out_of_stock e proibido nos demais; preços número > 0 ou null, mas ao menos um de `pricePix|priceInstallments` em ok; `url` começa com `https://`; `checkedAt` ISO com offset.
  - `buildDashboard({models, external, runs, alerts, now}) -> {data, newAlerts}`; `data = {generatedAt, lastRun:{runId,status,finishedAt,period}, nextRuns:[iso,iso], endsAt, cheapestNow:{modelId,...bestOffer}|null, models:[{...model, stats, classification, series, latestChecks}], ranking:[modelId], alerts:[...todos, mais recentes primeiro, máx 50], runsLog:[{runId,status,trigger,okCount,notQueryable,notes}]}`. `nextRuns`: próximos dois horários 08:00/20:00 BRT após `now`, vazios após `endsAt`.
  - CLI `node scripts/validate.mjs <arquivo>` → exit 1 e lista erros se inválido.
  - CLI `node scripts/aggregate.mjs` → lê `$DATA_DIR` (padrão `data/`), escreve `$OUT` (padrão `site/data.json`) e `data/alerts.json` (existentes + novos), imprime novos alertas como JSON em stdout (consumido pela rotina para abrir Issues).
- [ ] **Step 1: Testes** validate: snapshot válido da fixture → `[]`; `store:"submarino"` → erro; `ok` sem offer → erro; `not_queryable` com offer → erro; url `http://` → erro.
- [ ] **Step 2: Testes** build: com fixtures, `data.models.length === 4`; `tcl-c6k` presente com `stats.current === null`; `nextRuns` para `now=2026-10-30T15:00-03:00` → `["2026-10-30T20:00:00-03:00","2026-10-31T08:00:00-03:00"]`; para `now=2026-11-28T09:00-03:00` → `[]`; `alerts` não repete keys.
- [ ] **Step 3:** `npm test` → FAIL. **Step 4:** implementar. **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** `git commit -m "feat: validação de snapshot e agregador"`

### Task 4: Dashboard estático

**Files:**
- Create: `site/index.html`, `site/style.css`, `site/app.js`, `site/data.json` (gerado da fixture para desenvolvimento; substituído na Task 7)

**Interfaces:**
- Consumes: formato `data` da Task 3 via `fetch("data.json?t="+Date.now())`.
- Requisitos (spec §6): cabeçalho com última atualização/status/próximas consultas/contagem para 27/11; bloco “Mais barata agora”; 4 cards (foto `model.image` com `alt`, nome, código, melhor preço + loja, menor externo ou rótulo, menor do sistema, economia vs média, variação desde última consulta com ▲/▼, selo 🟢🟡🔴⚪, “Ver oferta” `target=_blank rel=noopener`; selo “desatualizado” se `stale`; “Pago no parcelado” se `usedInstallments`); ranking com nota “Os indicadores avaliam o preço, não a qualidade técnica da TV.”; gráfico Chart.js 4.4.1 (`https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js`) com seletor de modelo e de período 7/15/30/Tudo, uma linha por loja, linhas horizontais tracejadas mín/máx/média, pontos `newMin` destacados; tabela de lojas do último snapshot com status e motivo; alertas; log de execuções. Recarregar a cada 10 min. Tokens de cor em `:root` com tema escuro via `prefers-color-scheme`. Largura 375px sem rolagem horizontal. Formatação `Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"})`. Textos via `textContent` (dados vêm da web).
- [ ] **Step 1:** `node scripts/aggregate.mjs` com fixtures copiadas para um diretório temporário via env `DATA_DIR` (adicionar suporte `DATA_DIR`/`OUT` em aggregate) → gera `site/data.json`.
- [ ] **Step 2:** Implementar os três arquivos.
- [ ] **Step 3:** Servir `site/` (`npx --yes http-server site -p 8080` ou `python -m http.server`) e verificar no browser: sem erros no console; 4 cards; TCL mostra “Sem oferta encontrada”; troca de período altera o gráfico; viewport mobile 375px sem scroll horizontal; tema escuro legível.
- [ ] **Step 4:** `git commit -m "feat: dashboard público"`

### Task 5: Dados de referência verificados (pesquisa)

**Files:**
- Create: `data/models.json`, `data/external-history.json`

**Interfaces:**
- Produces: `models.json = [{id, name, brand, year, baseCode, fullCodes:[...], image, officialUrl, searchTerms:[...]}]`; `external-history.json = {[modelId]: {verified, lowest?, date?, source?, sourceUrl?, label?}}`.
- [ ] **Step 1:** Pesquisar (WebSearch/WebFetch) nas lojas oficiais LG/Samsung/TCL Brasil os códigos completos de 55" e a URL da imagem oficial de cada modelo. Registrar só o que a página oficial ou ≥ 2 varejistas confirmarem.
- [ ] **Step 2:** Pesquisar menor preço histórico em Buscapé/Zoom/comparadores. Só `verified:true` com valor, data e URL da fonte visíveis; caso contrário rótulo não verificado.
- [ ] **Step 3:** `node -e` que importa os dois arquivos e confere 4 modelos com ids globais e `fullCodes` não vazio → sem erro.
- [ ] **Step 4:** `git commit -m "data: modelos e histórico externo verificados"`

### Task 6: Prompt da rotina e workflow do Pages

**Files:**
- Create: `ROUTINE_PROMPT.md`, `.github/workflows/pages.yml`, `.github/workflows/test.yml`, `README.md`

**Interfaces:**
- `ROUTINE_PROMPT.md` instrui, em ordem: (1) guarda de data (`TZ=America/Sao_Paulo date`), sair sem commit após `2026-11-27T23:59`; (2) `runId` = data BRT + `T08`/`T20` (o mais próximo do horário atual), `period` manhã/noite; se o arquivo já existir, sair (evita duplicata); (3) para cada modelo × loja, buscar oferta: Mercado Livre via `https://api.mercadolibre.com/sites/MLB/search?q=<searchTerm>` filtrando `condition=new` e `official_store_id` ou reputação alta; demais via WebSearch `site:<domínio> <fullCode>` + WebFetch da página do produto; aceitar só se o título/página contém um `fullCode` (ou `baseCode` inequívoco com “55”), novo, vendido no Brasil com garantia nacional; preencher todos os campos do snapshot (spec §4), `linkCheck.httpStatus` do WebFetch/`curl -sI -L`; bloqueio/captcha → `not_queryable` com motivo; (4) gravar `data/runs/<runId>.json`, rodar `node scripts/validate.mjs` (se inválido, corrigir até 2 vezes; senão gravar run `failed` com notes); (5) `node scripts/aggregate.mjs > /tmp/new-alerts.json`; (6) `npm test`; (7) para cada alerta novo, `gh issue create` com título `[Alerta] <modelo> <tipo> R$ <preço> — <loja>` e corpo com todos os campos (se `gh` indisponível, registrar em notes); (8) `git add data site && git commit -m "data: coleta <runId>" && git push`. Também: nunca inventar preço, nunca usar usado/recondicionado/importado, atualizar `external-history.json` só com fonte verificável.
- `pages.yml`: on push to `main` (paths `site/**`) + `workflow_dispatch`; `actions/upload-pages-artifact@v3` com `path: site`, `actions/deploy-pages@v4`; permissions `pages: write, id-token: write`.
- `test.yml`: on push, `actions/setup-node@v4` node 22, `npm test`.
- [ ] **Step 1:** Escrever os arquivos. **Step 2:** `npm test` → PASS. **Step 3:** `git commit -m "chore: prompt da rotina e workflows"`

### Task 7: Publicação no GitHub (jonatanc)

- [ ] **Step 1 (usuário):** `gh auth login` com a conta jonatanc. Verificar: `gh api user --jq .login` → `jonatanc`.
- [ ] **Step 2:** Remover `site/data.json` de fixture e gerar a partir de `data/` real (sem runs: dashboard mostra estado vazio sem erro). `gh repo create jonatanc/tv-blackfriday-2026 --public --source . --push`.
- [ ] **Step 3:** `gh api -X POST repos/jonatanc/tv-blackfriday-2026/pages -f build_type=workflow`; disparar `gh workflow run pages.yml`; aguardar `gh run watch`.
- [ ] **Step 4:** `curl -sI https://jonatanc.github.io/tv-blackfriday-2026/` → `HTTP/2 200`.
- [ ] **Step 5 (usuário):** instalar o app Claude GitHub em `jonatanc/tv-blackfriday-2026` (https://github.com/apps/claude).

### Task 8: Rotina na nuvem e coleta inicial

- [ ] **Step 1:** `RemoteTrigger create` com cron `0 11,23 * * *`, repositório `jonatanc/tv-blackfriday-2026`, prompt: “Siga exatamente ROUTINE_PROMPT.md deste repositório.” Conferir `next_run_at` = próximo 08h/20h BRT.
- [ ] **Step 2:** `RemoteTrigger run` (coleta inicial, `trigger: initial`); acompanhar com `list_runs`/`get_run_log`.
- [ ] **Step 3:** `git pull`; verificar novo `data/runs/*.json` válido, `site/data.json` atualizado, `npm test` PASS.
- [ ] **Step 4:** Testar links: para cada oferta `ok`, `curl -s -o /dev/null -w "%{http_code}" -L <url>` e confirmar o código do modelo na página; registrar resultado no relatório final.
- [ ] **Step 5:** Abrir o dashboard público no browser (desktop e 375px) e conferir dados reais, horário da última atualização e próximas consultas.

### Task 9: Entrega

- [ ] Relatório ao usuário cobrindo os 9 entregáveis do pedido: URL pública, repositório, banco (data/), agendamento ativo (id da rotina + next_run_at), coleta inicial, histórico externo por TV, gráficos, teste de links, última execução/próximas. Listar lojas `not_queryable` e limitações. Lembrete: desativar a rotina após 27/11 (ou a guarda de data a torna no-op).
