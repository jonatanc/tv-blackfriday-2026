# Monitor de preços — TVs 55" | Black Friday 2026

Dashboard público: **https://jonatanc.github.io/tv-blackfriday-2026/**

Monitora LG OLED evo C6 (OLED55C6PSA), Samsung OLED S85F (QN55S85FAGXZD), Samsung OLED S85H (QN55S85HAEXZD) e TCL C6K (55C6K) em lojas brasileiras. As coletas acontecem às 08h e 20h (America/Sao_Paulo), de 30/10 a 27/11/2026.

## Como funciona

- Uma **tarefa agendada do Claude no PC do usuário** roda às 08h e 20h e segue [`ROUTINE_PROMPT.md`](ROUTINE_PROMPT.md). Ela lê as lojas pelo Chrome real, com a extensão Claude in Chrome, e publica com `scripts/publish.sh`. A rotina na nuvem foi desativada porque as lojas bloqueiam IPs de datacenter (403/503).
- Cada execução grava um snapshot em `data/runs/<runId>.json`. O repositório é o banco de dados, e o git guarda o histórico.
- `scripts/aggregate.mjs` calcula estatísticas, ranking e alertas e gera `site/data.json`. A lógica fica em `scripts/lib/` e é coberta por testes.
- Cada push em `site/` publica o GitHub Pages ([pages.yml](.github/workflows/pages.yml)).
- Cada alerta novo em `data/alerts.json` abre uma Issue ([alerts.yml](.github/workflows/alerts.yml)), e o GitHub envia um e-mail de notificação.

## Comandos

```bash
npm test                                   # testes (node:test, sem dependências)
node scripts/validate.mjs data/runs/*.json # valida snapshots
node scripts/aggregate.mjs                 # regenera site/data.json e data/alerts.json
```

## Regras de dados

- Nenhum preço é estimado. Campo não exibido pela loja = `null`. Loja ilegível = `not_queryable`.
- O menor preço histórico **externo** (`data/external-history.json`) só é registrado com valor e data visíveis na fonte. Sem isso, aparece como "Histórico externo não verificado".
- O mínimo, a média e as janelas de 30/90 dias **do sistema** vêm só dos snapshots próprios.

Especificação: [docs/superpowers/specs](docs/superpowers/specs/2026-10-30-monitor-tvs-55-black-friday-design.md)
