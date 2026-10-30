# Instruções da rotina de coleta (08h e 20h, America/Sao_Paulo)

Você é o coletor de preços deste repositório. Siga os passos **na ordem**. Regra de ouro:
**nunca invente, estime ou arredonde um preço**. Campo que você não viu na página = `null`.
Loja que você não conseguiu ler = `not_queryable` com o motivo. Um dado ausente é melhor que um dado falso.

## 0. Guarda de data e identificação

```bash
TZ=America/Sao_Paulo date +"%Y-%m-%dT%H:%M:%S%:z"
```

- Se agora for **depois de 2026-11-27T23:59-03:00**: não colete nada, não faça commit, encerre dizendo "monitoramento encerrado".
- `runId` = data BRT + `T08` se a hora BRT for menor que 14, senão `T20` (ex.: `2026-11-02T20`).
- `period` = `"manhã"` para T08, `"noite"` para T20.
- `trigger` = `"scheduled"`. Use `"initial"` só se o prompt que te acionou disser "coleta inicial", e `"manual"` se disser "manual".
- Se `data/runs/<runId>.json` já existir com `status` `ok` ou `partial`, encerre sem fazer nada (evita duplicata). Se existir com `status: "failed"`, refaça a coleta e sobrescreva o arquivo.
- Anote `startedAt` (ISO com `-03:00`).

## 1. Contexto

Leia `data/models.json` (modelos, `fullCodes` aceitos, `searchTerms`, `notes` com códigos a recusar) e
`data/external-history.json`. Leia também o snapshot mais recente em `data/runs/`, que traz as URLs que funcionaram da última vez. Comece por elas.

## 2. Coleta: para cada modelo × cada loja

Modelos: `lg-c6`, `sam-s85f`, `sam-s85h`, `tcl-c6k`.
Lojas (id → domínio):
`amazon` amazon.com.br · `magalu` magazineluiza.com.br · `casasbahia` casasbahia.com.br ·
`fastshop` fastshop.com.br · `kabum` kabum.com.br · `carrefour` carrefour.com.br ·
`mercadolivre` mercadolivre.com.br · loja oficial do fabricante, só para o modelo da marca:
`lg` lg.com/br, `samsung` samsung.com/br (shop.samsung.com/br), `tcl` tcl.com/br.

Para cada par (são 4 modelos × 8 lojas = 32 checks), registre **exatamente um** objeto `check`, com a melhor oferta válida encontrada:

1. **Encontrar o anúncio:** use WebSearch com `site:<domínio> <fullCode>` e depois `site:<domínio> <searchTerm>`. Se a última execução tinha URL para esse par, tente WebFetch nela primeiro.
   - Mercado Livre: tente `https://api.mercadolibre.com/sites/MLB/search?q=<fullCode>&condition=new`. Se responder 401/403, use WebSearch/WebFetch normal. Aceite só **loja oficial** (`official_store_id` não nulo, ou página que diga "Loja oficial") ou vendedor MercadoLíder com reputação verde.
2. **Abrir a página do produto** (WebFetch) e confirmar **todos** estes pontos:
   - o título, a ficha ou o código mostram um dos `fullCodes`. Também vale o `baseCode`, se a página deixar claro que é 55" e do ano certo. Qualquer código listado em `notes` como "não aceitar" → `rejected`;
   - tamanho 55";
   - produto **novo** (não usado, recondicionado, vitrine nem open box);
   - vendido/entregue no Brasil, com **garantia nacional** (não "importado"/"internacional");
   - não é combo com outro produto (soundbar etc.) → senão `rejected` com motivo.
3. **Preencher a oferta** com o que a página mostra:
   `title`, `code` (o código visto), `seller` (vendedor/“vendido por”), `pricePix` (preço à vista no Pix ou boleto à vista; `null` se não exibido), `priceInstallments` (preço total a prazo), `installments` (nº de parcelas), `shipping` (0 se “frete grátis”; número se exibido; `null` se depende de CEP), `inStock` (true/false), `coupon` (`{code, description, discountPct}`, com `discountPct` = % de desconto sobre o preço sem cupom, calculado só com números exibidos, ou `null`), `promoEndsAt` (ISO, só se a loja exibir prazo), `warranty` (texto da garantia exibido, ou `null`), `url` (URL canônica `https://`, sem parâmetros de rastreio), `checkedAt` (agora, ISO `-03:00`).
4. **Testar o link:** `curl -s -o /dev/null -w "%{http_code}" -L -A "Mozilla/5.0" "<url>"` → `linkCheck.httpStatus`. `linkCheck.codeMatched` = true se o passo 2 confirmou o código.
5. **Status do check:**
   - `ok`: oferta válida, em estoque.
   - `out_of_stock`: anúncio correto, mas indisponível (preencha a oferta com `inStock:false`).
   - `not_found`: a loja foi lida, mas não vende esse modelo.
   - `not_queryable`: bloqueio, captcha, erro 403/5xx, página sem preço renderizado. Em `reason`, diga o que aconteceu.
   - `rejected`: só há anúncios inválidos (outro tamanho/código, usado, importado, combo). Em `reason`, diga qual.
   `reason` é obrigatório em `not_found`, `not_queryable` e `rejected`. Nesses três **não** inclua `offer`.

Se várias ofertas válidas existirem na mesma loja (vendedores diferentes), registre a de menor preço Pix (ou a prazo, se não houver Pix).
Não gaste mais de ~3 tentativas por par: se não achou, use `not_found` ou `not_queryable` e siga em frente.

## 3. Gravar o snapshot

Grave `data/runs/<runId>.json`:

```json
{
  "runId": "2026-11-02T20", "startedAt": "...", "finishedAt": "...",
  "period": "noite", "trigger": "scheduled",
  "status": "ok | partial | failed",
  "notes": "resumo curto: lojas bloqueadas, observações",
  "checks": [ { "modelId": "...", "store": "...", "status": "...", "reason": null, "offer": { ... } } ]
}
```

`status` da execução, avaliado nesta ordem (a primeira regra que bater vale):
1. `failed`: nenhum check com status `ok` (inclui execução só com `out_of_stock`; ela fica fora das estatísticas, mas permanece no log).
2. `partial`: algum check `not_queryable`.
3. `ok`: nos demais casos.

Valide:

```bash
node scripts/validate.mjs data/runs/<runId>.json
```

Corrija os erros apontados (no máximo 2 tentativas). Se continuar inválido, reescreva o arquivo como `{"runId": ..., "status": "failed", "trigger": ..., "notes": "<erros>", "checks": []}` mais os campos de data, e siga.

## 4. Histórico externo (só se houver dado novo verificável)

Se, durante a pesquisa, encontrar em comparador (Buscapé, Zoom, Promobit, Oficina da Net, Pelando) um **menor preço histórico** menor que o registrado em `data/external-history.json`, só atualize a entrada se **todas** estas condições valerem:
- valor **e** data visíveis na página;
- a página se refere ao **mesmo modelo**: mostra um dos `fullCodes` (ou o `baseCode` com 55" e o ano certo), não a versão de 50"/65" nem a de outro ano;
- produto novo (não usado nem recondicionado), sem ser combo.

Ao atualizar, preencha `verified: true`, `lowest`, `date`, `source`, `sourceUrl`, `checkedAt` e, em `note`, o código visto na página e a loja (se informada). Se alguma condição falhar, não atualize.

Se um modelo em `data/models.json` tiver `"image": null` e você encontrar a imagem oficial do produto (URL `https://` de imagem `.jpg/.png/.webp` que responde 200 no `curl -sI`), preencha `image`.

## 5. Agregar, testar e publicar

```bash
node scripts/aggregate.mjs
npm test
git add data site
git commit -m "data: coleta <runId> (<status>)"
git push origin HEAD:main
```

- `aggregate.mjs` atualiza `site/data.json` e `data/alerts.json`. Os workflows do GitHub publicam o site e abrem uma Issue para cada alerta novo. Você **não** precisa criar Issues.
- Se `npm test` falhar, **não** faça commit de código. Commite só `data/runs/<runId>.json` e investigue no resumo final.
- Se o push for rejeitado por divergência, faça `git pull --rebase origin main` e tente de novo (1 vez).

## 6. Resumo final

Termine com um resumo de até 10 linhas: `runId`, status, quantas ofertas `ok`, melhor preço por modelo (loja), lojas `not_queryable` e alertas novos (saída do aggregate).
