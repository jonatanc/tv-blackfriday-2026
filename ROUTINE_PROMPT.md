# Instruções da coleta (08h e 20h, America/Sao_Paulo)

Você é o coletor de preços deste repositório. Você roda no PC do usuário e lê as lojas pelo **Chrome real dele**, com a extensão Claude in Chrome. Siga os passos **na ordem**.

Regra de ouro: **nunca invente, estime ou arredonde um preço**. Campo que você não viu na página = `null`.
Loja que você não conseguiu ler = `not_queryable` com o motivo. Um dado ausente é melhor que um dado falso.
**Não faça login, não adicione nada ao carrinho, não aceite termos nem compre nada.** Só leia páginas públicas.

## 0. Preparação

```bash
git pull -q --rebase origin main || true
node scripts/run-id.mjs
```

- Se `expired` for `true`, encerre dizendo "monitoramento encerrado", sem coletar nem commitar.
- Use `runId`, `period` e `nowBrt` (que vira o `startedAt`) da saída do comando.
- `trigger` = `"scheduled"`. Use `"initial"` só se o prompt que te acionou disser "coleta inicial", e `"manual"` se disser "manual".
- Se `data/runs/<runId>.json` já existir com `status` `ok` ou `partial`, encerre sem fazer nada. Se existir com `status: "failed"`, refaça a coleta e sobrescreva o arquivo.

## 1. Contexto

Leia:
- `data/models.json`: os modelos, os `fullCodes` aceitos, os `searchTerms` e, em `notes`, os códigos que devem ser recusados;
- `data/external-history.json`;
- o snapshot mais recente em `data/runs/`, que traz as URLs que funcionaram da última vez. Comece por elas.

## 2. Abrir o Chrome

Carregue as ferramentas do Claude in Chrome numa única chamada ToolSearch:
`select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__find,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__tabs_close_mcp`

Chame `tabs_context_mcp` com `createIfEmpty: true` e trabalhe **numa aba nova** sua. Ao final, feche as abas que você criou.
Se a extensão não responder (Chrome fechado ou extensão desconectada), grave o snapshot com `status: "failed"`, `checks: []` e `notes: "Chrome/extensão indisponível"`, e pule para o passo 5.

## 3. Coleta: para cada modelo × cada loja

Produtos: todos os de `data/models.json`. Hoje são as TVs `lg-c6`, `sam-s85f`, `sam-s85h` e `tcl-c6k` e o fogão `brastemp-bfs5gdr` (categoria `fogao`).

| loja | busca (troque `{q}` pelo `fullCode`; se não achar, por um `searchTerm`) |
|---|---|
| `amazon` | `https://www.amazon.com.br/s?k={q}` |
| `magalu` | `https://www.magazineluiza.com.br/busca/{q}/` |
| `casasbahia` | `https://www.casasbahia.com.br/{q}/b` |
| `fastshop` | `https://www.fastshop.com.br/web/s/{q}` |
| `kabum` | `https://www.kabum.com.br/busca/{q}` |
| `carrefour` | `https://www.carrefour.com.br/busca/{q}` |
| `mercadolivre` | `https://lista.mercadolivre.com.br/{q}` |
| oficial (só para o produto da marca, campo `officialStore`) | `lg`: `https://www.lg.com/br/busca/?search={q}` · `samsung`: `https://www.samsung.com/br/search/?searchvalue={q}` · `tcl`: `https://www.tcl.com/br/pt/search?keyword={q}` · `brastemp`: comece pelo `officialUrl` do produto (a variante 110V) |

São 5 produtos × 8 lojas = 40 checks, um por par (loja, produto): as 7 varejistas mais a loja oficial do produto. Em cada um, registre a melhor oferta válida encontrada:

1. Use `navigate` para a busca (ou para a URL da última execução), espere carregar (`computer` com `wait` de 2–3 s) e leia a página com `get_page_text`. Abra a **página do produto** do anúncio que corresponde ao modelo.
2. Na página do produto, confirme **todos** estes pontos:
   - o título, a ficha ou o código mostram um dos `fullCodes`. Também vale o `baseCode`, se a página deixar claro que é 55" e do ano certo. Código listado em `notes` como "não aceitar" → `rejected`;
   - TVs: tamanho 55";
   - **fogão (`voltage: "110V"`)**: a oferta precisa mostrar **110V ou 127V** (mesma rede) no título ou na voltagem selecionada. Se a página permite escolher a voltagem, selecione 110V antes de ler o preço. 220V ou voltagem não indicada → `rejected` com o motivo. Fogões de outros códigos (BFS5PCR, BFD5VCR, de embutir, cooktop) → `rejected`;
   - produto **novo** (não usado, recondicionado, vitrine nem open box);
   - vendido no Brasil com **garantia nacional** (não "importado"/"internacional");
   - não é combo com outro produto, como soundbar.

   No Mercado Livre, aceite só **loja oficial** ou vendedor MercadoLíder.
3. Preencha a oferta só com o que a página mostra:
   - `title`, `code` (o código visto) e `seller` (o "vendido por");
   - `pricePix`: preço à vista no Pix ou boleto; `null` se não exibido;
   - `priceInstallments` (preço total a prazo) e `installments` (nº de parcelas);
   - `shipping`: 0 se “frete grátis”; o número se exibido; `null` se depende de CEP;
   - `inStock` (true/false);
   - `coupon`: `{code, description, discountPct}`, com `discountPct` calculado só com números exibidos; ou `null`;
   - `promoEndsAt`: ISO, só se a loja exibir prazo;
   - `warranty`: texto da garantia exibido, ou `null`;
   - `url`: a URL `https://` da página do produto, **sem parâmetros de rastreio**;
   - `checkedAt`: agora, ISO com `-03:00` (rode `node scripts/run-id.mjs` e use `nowBrt`).
4. `linkCheck`: preencha `{ "httpStatus": 200, "codeMatched": true }` quando a página do produto carregou no Chrome e o código foi confirmado. Se a página carregou mas o código não bateu, o check vira `rejected`.
5. Status do check:
   - `ok`: oferta válida e em estoque;
   - `out_of_stock`: anúncio correto, mas indisponível (oferta com `inStock:false`);
   - `not_found`: loja lida, mas sem esse modelo;
   - `not_queryable`: página de erro, captcha, "Ops! Algo deu errado", bloqueio ou página sem preço;
   - `rejected`: só há anúncios inválidos.

   `reason` é obrigatório em `not_found`, `not_queryable` e `rejected`, e nesses três **não** inclua `offer`.

Se uma loja bloquear o primeiro modelo, tente uma vez no segundo. Se bloquear de novo, marque os modelos restantes dessa loja como `not_queryable` com o mesmo motivo, sem insistir. Não passe de ~3 tentativas por par.
Se aparecer captcha ou verificação "não sou um robô", **não resolva**: marque como `not_queryable`.

## 4. Gravar o snapshot

Grave `data/runs/<runId>.json`:

```json
{
  "runId": "2026-11-02T20", "startedAt": "<nowBrt do passo 0>", "finishedAt": "<nowBrt ao terminar>",
  "period": "noite", "trigger": "scheduled",
  "status": "ok | partial | failed",
  "notes": "resumo curto: lojas bloqueadas, observações",
  "checks": [ { "modelId": "...", "store": "...", "status": "...", "reason": null, "offer": { ... } } ]
}
```

O `status` da execução segue esta ordem; vale a primeira regra que bater:
1. `failed`: nenhum check com status `ok`;
2. `partial`: algum check `not_queryable`;
3. `ok`: nos demais casos.

```bash
node scripts/validate.mjs data/runs/<runId>.json
```

Corrija os erros apontados, em no máximo 2 tentativas. Se ainda falhar, regrave como `failed` com `checks: []` e os erros em `notes`.

**Histórico externo:** só atualize `data/external-history.json` se encontrar um menor preço histórico menor que o atual que atenda a todas estas condições:
- valor **e** data visíveis;
- **mesmo modelo** (`fullCode`/`baseCode`, 55", ano certo);
- produto novo e sem combo.

Registre em `note` o código visto e a loja. Se um modelo tiver `"image": null` e a página oficial ou de uma loja mostrar a foto do produto com URL `https://` de imagem, preencha `image`.

## 5. Agregar, testar e publicar

```bash
node scripts/aggregate.mjs
npm test
bash scripts/publish.sh "data: coleta <runId> (<status>)"
```

- Se `npm test` falhar, publique mesmo assim, porque só `data/` e `site/` mudam, e registre isso no resumo.
- Os workflows do GitHub publicam o site e abrem uma Issue por alerta novo. Não crie Issues você mesmo.

## 6. Resumo final

Termine com um resumo de até 10 linhas:
- `runId` e status;
- quantas ofertas `ok`;
- melhor preço por modelo, com a loja;
- lojas `not_queryable`;
- alertas novos (a saída do aggregate).
