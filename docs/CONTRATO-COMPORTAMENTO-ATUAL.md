# Contrato de Comportamento Atual — Fechamento de Caixa

> **Este documento é a fonte da verdade da migração.** Todo teste de regressão da
> Fase 7 compara o sistema novo contra o que está escrito aqui. Nenhuma fórmula,
> campo, rótulo ou fluxo descrito abaixo deve mudar de sentido na migração para
> Nuxt 4 + Vue 3 + Vuetify 3 + Supabase — só a tecnologia por trás muda.
>
> Base: leitura completa de `FECHAMENTOCAIXA/index.html` (5758 linhas),
> `app-core.js` e `app-storage.js`, em 14/09/2026, depois das correções do ciclo
> infinito de `calcTotalSangria`/`recalcularTudo` e da dupla contagem da sangria
> (já aplicadas e testadas antes deste documento).

---

## 1. Telas / Painéis

| Tela | Como abre | Como fecha | Conteúdo |
|---|---|---|---|
| **Deck** (lista) | Tela inicial; sempre montada, outras telas sobrepõem | Não fecha (é a base) | Cards com responsável, id, data, `caixa - turno`, valor total, badge de diferença; ações Ver/Editar/Excluir |
| **Formulário** (novo/editar) | FAB "+", botão "Novo" da topbar, ou "Editar" de um card | Botão voltar, `Esc`, clique fora, ou salvar | 6 seções navegáveis (Identificação → Transferências → Lançamentos → Relatórios → Discriminação → Relatório Final) |
| **Relatório** (visualização) | Clique no card ou botão "Ver" | Botão voltar (⚠ `Esc` não fecha — bug conhecido, preservar ou corrigir é decisão explícita) | Resumo somente leitura do fechamento |
| **Modal de exclusão** | Botão "Excluir" de um card | Cancelar / Excluir / clique fora | Confirmação simples, sem texto dinâmico |
| **Sidebar** | Logo/menu, sempre visível ≥900px, drawer <900px | `Esc`, backdrop, navegar em mobile | Único item: "Fechamentos" |
| **Bottom nav** (mobile) | Sempre visível <900px | — | Único item: "Fechamentos" |

Fechar o formulário sem salvar **sempre descarta tudo** (`resetarFormulario()` roda ao fechar) — não existe rascunho.

---

## 2. Campos por seção (fonte única para o schema do banco)

### Seção 1 — Identificação
`fechamentoId` (gerado `FC-{timestamp36}-{random4}`), `data` (readonly, hoje), `caixa` (select: Caixa 1/2/3/4), `turno` (select: Manhã/Tarde), `responsavel` (texto livre).

### Seção 2 — Transferências
- **Entradas** (lista dinâmica `N`): `lacre`, `valor`, `descricao`. Total = soma → `totalEntrada`.
- **Sangrias** (lista dinâmica `N`): `descricao`, `lacre`, `valor`. Total = soma → `totalSangria` **e** `totalSaida` (mesmo valor, dois campos).

### Seção 3 — Lançamentos
Tipos: `despesa` | `mercadoria` | `retirada`. Por item: `dataRef`, `dataNfe`, `nNfe`, `fornecedor`, `tipoMer` (computado/não computado — rótulo "Tipo", aparece em todos os tipos), `valor`, observação (`obsTipo`: texto ou áudio; `obsTexto` ou `obsAudio` base64), `foto`, `status` (pago/não pago), `vencimento`, `fotoNota`.
UI atual só permite 1 bloco visível por tipo via orb (o modelo salvo suporta N — confirmado ao restaurar).

### Seção 4 — Relatórios
**PDV**: `relatorioPDV` (texto, hoje morto), `nrClientes`, `pdvDinheiro/Credito/Debito/Pix/Voucher/Crediario`, `totalPDV` (soma), `ticketMedio` (`totalPDV/nrClientes`), `imgPDV` (hoje morto).
**Maquininhas**: `nrMaquininha` (hoje morto), `manhaInicial`/`tardeFinal` (hoje mortos), `credito/debito/pix/voucherManha` e `...Tarde` (usados em cálculo, hoje **não persistidos**), `liqCredito/Debito/Pix/Voucher` = Tarde − Manhã (únicos persistidos hoje).
**Crediário**: listas `cliente` e `colaborador` (`nome`, `valor`, foto do cupom hoje morta); `totalCredClientes`, `totalCredColab`, `totalCrediario` (soma).

### Seção 5 — Discriminação
Lista dinâmica sem limite por tipo (`mercadoria`/`despesa`/`retirada`): `qtd`, `produto`, `grupo` (14 opções fixas), `valUnit`, `descontoVal`, `descontoPct`, `total` = `max(0, qtd*valUnit - descontoVal - subtotal*descontoPct/100)`.

### Seção 6 — Relatório Final
`saldoFisicoEsperado`/`dinheiroContado` (hoje mortos — ver decisão na seção 5 abaixo), `valorTotalFinal`, `relTransfEntrada/Saida`, `relDespesas/Mercadoria/Retiradas`, `relCartoes`, `diferenca`/`relFinalDiferenca` (mesmo valor), `relPdvDiferenca`, blocos de conferência por forma (Crédito/Pix/Débito/Voucher/Crediário: `relFinal*`, `relPdv*`, `diff*`), card visual de diferença geral.

---

## 3. Fórmulas (não alterar)

```
calcTotalEntrada   = Σ entradas[].valor                       → totalEntrada
calcTotalSangria   = Σ sangrias[].valor                       → totalSangria = totalSaida
calcPDV.totalPDV   = pdvDinheiro+Credito+Debito+Pix+Voucher+Crediario
calcPDV.ticketMedio= nrClientes>0 ? totalPDV/nrClientes : 0
calcCartoes.liqX   = xTarde - xManha   (X = Credito/Debito/Pix/Voucher)
calcDiscTotal      = max(0, qtd*valUnit - descontoVal - (qtd*valUnit)*descontoPct/100)
recalcularLancamentos → agrupa valor por tipo: {despesa, mercadoria, retirada}
recalcularCrediario    → totalCredClientes + totalCredColab = totalCrediario

calcRelatorioFinal:
  totalSaidas     = totalSaida + despesas + mercadoria + retiradas   // totalSaida JÁ é a sangria — não somar sangria de novo
  cartoes         = liqCredito + liqDebito + liqPix + liqVoucher
  valorTotalFinal = totalPDV + totalEntrada
  diferenca       = valorTotalFinal - totalSaidas - cartoes - totalCrediario
  relPdvDiferenca = totalPDV - (totalSaidas - totalEntrada)
  diff{Forma}     = liq{Forma} - pdv{Forma}     (Forma = Credito/Debito/Pix/Voucher)
  diffCrediario   = totalCrediario - pdvCrediario
  status: |diferenca|<0.01 → zero; diferenca>0 → sobra; diferenca<0 → falta
```

`recalcularTudo()` = `calcTotalSangria(); calcPDV(); calcCartoes(); recalcularLancamentos(); recalcularCrediario(); calcRelatorioFinal();` — ordem fixa, sem recursão (o ciclo infinito antigo já foi corrigido).

**Fórmula pronta mas nunca ligada** (`app-core.js::calculatePhysicalClosing`), candidata ao card aditivo da Fase 4.7:
```
expected = pdvCash + entradas - sangrias - despesas - mercadoria - retiradas
difference = contado - expected
```

---

## 4. Persistência (estrutura do registro)

Hoje em `localStorage["fechamentos_caixa"]`, um array de objetos. Campos e listas exatamente como na seção 2 acima, com duas notas importantes para o schema novo:

1. **Tipos inconsistentes hoje**: `entradas[].valor` e `sangrias[].valor` são string formatada (`"150,00"`); os demais valores monetários são `number`. No banco novo, tudo é `numeric`.
2. **Campos que hoje NUNCA são salvos** (perda de dados a corrigir persistindo de verdade, sem mudar o que a tela mostra): `relatorioPDV`, `pdvDinheiro`, `nrMaquininha`, `manhaInicial`, `tardeFinal`, os 8 valores brutos de manhã/tarde por bandeira, `dinheiroContado`, todas as fotos (`imgPDV`, `imgManha`, `imgTarde`, `lancFoto`, `lancFotoNota`, foto do cupom de crediário).

---

## 5. Ações / Fluxo (ordem A→B→C→D a preservar)

1. **Novo**: gera novo `fechamentoId`, formulário limpo, seção 1 ativa.
2. **Salvar**: `recalcularTudo()` → monta registro → insere ou substitui pelo `id` → fecha formulário.
3. **Editar**: carrega registro → preenche campos → restaura listas dinâmicas → `recalcularTudo()`.
   - **Bug a corrigir na migração** (sem mudar o fluxo): hoje NÃO restaura PDV por forma, maquininhas brutas, `relatorioPDV`, `dinheiroContado` — e como tudo passa a ser persistido no banco (item 4.2), a correção é automática ao restaurar 100% dos campos salvos.
4. **Excluir**: confirmação modal → remove do array → sem soft-delete/undo hoje.
5. **Visualizar relatório**: somente leitura, gerado a partir do registro salvo.
   - **Bug a corrigir**: hoje mostra campos fantasmas (`lacreInicial`/`entradaInicial`/`lacreFinal`, que nunca existiram no modelo atual) e nunca lista os itens individuais de `entradas[]`/`sangrias[]`/`discriminacoes[]` apesar de estarem salvos.
6. **Pesquisar**: filtro client-side por texto, hoje cobre `id/data/caixa/turno/responsavel/valorTotalFinal/diferenca/lancamentos/crediario` — **não** cobre `entradas/sangrias/discriminacoes` (bug a corrigir, ampliando a busca sem mudar sua forma de uso).
7. **Ordenação**: sempre por `criadoEm` desc, sem opção de mudar.

---

## 6. Regras que NÃO mudam mesmo sendo "estranhas"

- `totalSaida` e `totalSangria` são sempre o mesmo valor (campo redundante mantido).
- Só é possível ter 1 lançamento visível por tipo através do orb da seção 3 (embora o modelo suporte N).
- `relDespesas`/`relMercadoria`/`relRetiradas`/`relCartoes`/`diferenca` continuam existindo como campos próprios mesmo com `relFinalDiferenca` duplicando `diferenca`.
- Qualquer pessoa pode criar, editar e excluir qualquer fechamento (sem permissão por cargo) — preservado mesmo com login real (Fase 2).

## 7. O que muda por decisão explícita do usuário/produto (não é regressão)

- Login real (Supabase Auth) no lugar do prompt() fake de "Conta Google".
- Fotos e áudio passam a ser realmente salvos (Supabase Storage).
- Card informativo aditivo de "esperado × contado" (Fase 4.7) — não substitui a `diferenca` atual.
- Importador único do `localStorage` antigo para o Supabase, no primeiro acesso.
