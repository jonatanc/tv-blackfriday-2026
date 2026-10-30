# Monitor de preços — TVs 55" | Black Friday 2026 — Design

Data: 2026-10-30 · Status: aprovado em conversa, aguardando revisão da spec escrita

## 1. Objetivo

Um único link público (sem login, HTTPS, mobile-first) que, a cada manhã e noite,
mostra qual das quatro TVs de 55" está mais barata, em qual loja, quanto variou,
qual a menor marca histórica verificável e se a oferta atual vale a pena — com
dados reais, sem preços inventados — de 30/10/2026 até 27/11/2026 23h59 (America/Sao_Paulo).

### Modelos monitorados (exclusivamente 55")

| id | Modelo | Código base | Fabricante |
|----|--------|-------------|------------|
| `lg-c6`  | LG OLED evo C6 (2026)          | OLED55C6 | LG |
| `sam-s85f` | Samsung OLED S85F (2025)     | 55S85F   | Samsung |
| `sam-s85h` | Samsung OLED S85H (2026)     | 55S85H   | Samsung |
| `tcl-c6k`  | TCL C6K QD-Mini LED (2025)   | 55C6K    | TCL |

O código completo comercializado no Brasil (com sufixo, ex.: `OLED55C6PSA`,
`QN55S85FAGXZD`) é validado na pesquisa inicial nas lojas oficiais e gravado em
`data/models.json` (`fullCodes: [...]`). Ofertas cujo anúncio não contenha um dos
`fullCodes` (ou o código base inequívoco, quando a loja omite o sufixo) são descartadas.

## 2. Decisões tomadas

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Agendador | Rotina do Claude na nuvem (RemoteTrigger), cron `0 11,23 * * *` UTC | Roda com o PC desligado. Brasil sem horário de verão desde 2019 → 11h/23h UTC = 08h/20h BRT |
| Hospedagem | GitHub Pages do repositório público `jonatanc/tv-blackfriday-2026` | Única opção que garante acesso sem login; artifact do Claude com `db` exige visitante logado |
| Banco de dados | Arquivos JSON versionados no próprio repositório | Persistente, auditável via git, sem credenciais extras, sobrevive a republicações |
| Coleta | O agente Claude pesquisa via WebSearch/WebFetch; Mercado Livre via API pública | Não há APIs autorizadas das demais lojas disponíveis ao usuário |
| Alertas | Listados no dashboard + GitHub Issue por alerta novo (e-mail automático do GitHub para jonatanc) | Gratuito, sem SMTP nem tokens extras |

## 3. Arquitetura

```
Rotina nuvem (08h/20h BRT)
  ├─ lê data/models.json, data/external-history.json, últimos snapshots
  ├─ pesquisa lojas (WebSearch/WebFetch, API ML) → valida cada oferta
  ├─ grava data/runs/<YYYY-MM-DD>T<HH>.json        (snapshot da execução)
  ├─ node scripts/validate.mjs <snapshot>          (esquema; aborta se inválido)
  ├─ node scripts/aggregate.mjs                    (gera site/data.json + data/alerts.json)
  ├─ node --test                                    (testes do agregador)
  ├─ cria GitHub Issues para alertas novos
  └─ git commit + push  → GitHub Actions publica site/ no Pages
```

### Estrutura do repositório

```
data/models.json              modelos, códigos completos, foto, lojas-alvo
data/external-history.json    menor preço histórico externo verificado (ou não verificado)
data/runs/*.json              um snapshot por execução (append-only)
data/alerts.json              alertas emitidos (chave de deduplicação)
scripts/validate.mjs          validação de esquema do snapshot
scripts/aggregate.mjs         cálculos determinísticos → site/data.json
scripts/lib/*.mjs             funções puras (stats, ranking, alertas)
test/*.test.mjs               node:test
site/index.html, app.js, style.css, data.json
ROUTINE_PROMPT.md             instruções versionadas da rotina
.github/workflows/pages.yml   deploy do site/ no Pages a cada push
```

Sem dependências npm (Node 22 puro). Frontend usa Chart.js via cdnjs com versão fixa.

## 4. Formato dos dados

### Snapshot `data/runs/<id>.json`
```json
{
  "runId": "2026-10-30T20",
  "startedAt": "2026-10-30T20:03:11-03:00",
  "finishedAt": "...",
  "period": "noite",
  "trigger": "scheduled | manual | initial",
  "status": "ok | partial | failed",
  "notes": "texto livre",
  "checks": [
    {
      "modelId": "lg-c6",
      "store": "amazon",
      "status": "ok | out_of_stock | not_found | not_queryable | rejected",
      "reason": "ex.: captcha / anúncio é modelo 65\" / vendedor internacional",
      "offer": {
        "title": "...", "code": "OLED55C6PSA", "seller": "Amazon.com.br",
        "pricePix": 7999.0, "priceInstallments": 8888.0, "installments": 10,
        "shipping": 0, "inStock": true, "coupon": null,
        "promoEndsAt": null, "warranty": "12 meses fabricante",
        "url": "https://...", "linkCheck": { "httpStatus": 200, "codeMatched": true },
        "checkedAt": "2026-10-30T20:05:00-03:00"
      }
    }
  ]
}
```
`offer` só existe quando `status` é `ok` ou `out_of_stock`. Preços em BRL, número.
Campos desconhecidos ficam `null` — nunca estimados.

### `data/external-history.json`
Por modelo: `{ "verified": true, "lowest": 6999.0, "date": "2026-07-15", "source": "Buscapé", "sourceUrl": "..." }`
ou `{ "verified": false, "label": "Histórico externo não verificado" }`.
Só é atualizado quando uma fonte verificável (página com valor e data visíveis) é encontrada.

## 5. Cálculos (scripts/aggregate.mjs)

Por modelo, usando apenas ofertas `ok` com `inStock: true`:
- **Preço atual** = menor `pricePix` (fallback `priceInstallments` se Pix ausente, marcado) do último snapshot em que o modelo teve oferta; oferta com `checkedAt` > 36h → flag `stale`.
- **Mínimo do sistema** (com data e loja), **máximo do sistema**, **média** (média dos melhores preços por execução), **mín. 30d / 90d**.
- **Variação** vs. execução anterior (R$ e %).
- **Economia vs. média** (%).
- **Diferença vs. menor histórico externo** (%), quando verificado.
- **Referência de classificação** = menor entre mínimo externo verificado e mínimo do sistema; exige mínimo externo verificado OU ≥ 6 execuções próprias, senão ⚪.
  - 🟢 Excelente: atual ≤ referência
  - 🟡 Boa: atual ≤ referência × 1,05
  - 🔴 Aguardar: acima disso
  - ⚪ Sem histórico suficiente
- **Série para gráficos**: por dia e por loja, menor preço do dia; marcação de pontos que bateram nova mínima do sistema.

### Alertas
Gerados comparando o snapshot atual com o histórico:
1. Novo menor preço registrado pelo sistema.
2. Queda ≥ 5% vs. execução anterior (mesmo modelo, melhor preço).
3. Oferta ≤ menor histórico externo verificado.
4. Cupom que reduz o preço em ≥ 3%.
5. Promoção com prazo de encerramento informado.

Cada alerta: modelo, preço anterior, preço novo, economia %, loja, horário, link.
Chave de deduplicação `tipo|modelo|loja|preço`; alerta com chave já existente não é reemitido.

## 6. Dashboard (site/)

- Cabeçalho: última atualização, status da última execução, próximas consultas, contagem regressiva para 27/11.
- Resumo: “Mais barata agora” (modelo, loja, preço, link).
- 4 cards: foto, nome/código, melhor preço atual, loja, menor histórico externo (ou rótulo não verificado), menor do sistema, economia vs. média, variação desde a última consulta, selo de oportunidade, botão “Ver oferta”.
- Ranking de oportunidades com a nota “avalia preço, não qualidade técnica”.
- Gráficos (Chart.js) por modelo: linhas por loja, faixa mín/máx/média, pontos de nova mínima; filtro 7/15/30 dias/tudo.
- Tabela comparativa de lojas do último snapshot, com status por loja (inclusive “não consultável” e motivo).
- Alertas recentes.
- Log das execuções.
- Recarrega `data.json` a cada 10 min (cache-busting). Tema claro/escuro, 16px de margem, sem rolagem horizontal.

## 7. Rotina na nuvem

- Criada via RemoteTrigger sobre o repositório `jonatanc/tv-blackfriday-2026`.
- O prompt aponta para `ROUTINE_PROMPT.md` versionado (regras de coleta, lojas, validação, formatos, encerramento).
- Guarda de data: se agora > 2026-11-27T23:59-03:00, a execução termina sem coletar.
- Execução inicial manual (`trigger: initial`) imediatamente após a criação.
- Lojas: Amazon BR, Magazine Luiza, Casas Bahia, Fast Shop, KaBuM!, Carrefour, Mercado Livre (lojas oficiais/vendedores confiáveis), lojas oficiais LG, Samsung, TCL.

## 8. Tratamento de falhas

- Loja inacessível/captcha → `not_queryable` com motivo; nada é inventado.
- Anúncio de outro tamanho/modelo, usado, recondicionado, importado sem garantia BR → `rejected` com motivo.
- Snapshot inválido → não é commitado; a execução grava um snapshot mínimo `status: failed` com `notes`.
- Execução perdida (rotina não rodou) → visível no log pela lacuna; dashboard mostra última coleta válida e “próxima consulta”.

## 9. Testes e verificação

- `node --test`: estatísticas, classificação, deduplicação de alertas, stale, série diária, com fixtures.
- `scripts/validate.mjs` em todo snapshot antes do commit.
- Verificação de entrega: repositório publicado, Pages respondendo 200 via HTTPS, execução inicial commitada, links das ofertas checados (HTTP + código do modelo), rotina listada com `next_run_at` correto.

## 10. Limitações declaradas

- A coleta depende da leitura de páginas pelo agente; lojas com bloqueio anti-bot aparecerão como “não consultável”.
- Preços de cupons/condições exclusivas de app ou login não são capturáveis.
- Os dados ficam públicos no repositório (requisito do Pages gratuito).

## 11. Pré-requisitos do usuário

1. `gh auth login` com a conta GitHub **jonatanc**.
2. Instalar o app Claude GitHub com acesso ao repositório (para a rotina fazer commit/push).
