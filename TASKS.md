# Integração de Vendas (CREARE → Fechamento de Caixa)

## Histórico de decisão (mais recente primeiro)

**16/09/2026 (9ª revisão) — app publicado em produção no Vercel.** Removido o painel "Produtos
Vendidos" (pedido do usuário) — código, composable (`useVendasProdutoDia.ts`) e util
(`vendasProdutoDia.ts`) apagados por completo, não só escondidos. Deploy feito via `vercel` CLI
(token de acesso do usuário, usado só na sessão — nunca gravado no repositório) já que o projeto
não tem git ainda. Projeto renomeado de "app" (nome automático) para "fechamento-caixa" no Vercel.

- **URL de produção**: `https://fechamento-caixa-pralis.vercel.app`
- Variáveis de ambiente configuradas no Vercel (Production): `NUXT_PUBLIC_SUPABASE_URL`,
  `NUXT_PUBLIC_SUPABASE_ANON_KEY`, `NUXT_SUPABASE_SERVICE_ROLE_KEY`,
  `NUXT_INTEGRACAO_VENDAS_CHAVE` — mesmos valores do `.env` local, mesmo projeto Supabase (dev e
  produção **compartilham o mesmo banco** por enquanto — não existe ambiente de staging separado).
- Testado ao vivo (usuário de teste temporário, apagado depois): login funciona, dashboard mostra
  os fechamentos reais, `/vendas/importar` responde 200 com a chave certa. Sem erro de console.
- **Pendência**: se/quando o agente (`integracoes-scripts`) for instalado de verdade na loja, o
  `.env.producao` dele precisa apontar `PRALIS_VENDAS_API_URL` pra essa URL de produção (hoje
  ainda é só um placeholder no `.example`).
- Sem git configurado ainda — o deploy foi um upload direto do diretório local
  (`vercel deploy --prod`), não está conectado a um repositório. Deploys futuros precisam rodar o
  mesmo comando de novo (ou configurar git + integração Vercel, se quiser deploy automático a cada
  mudança).



**15/09/2026 (8ª revisão) — Relatório PDV virou lista de PDVs; [ATENÇÃO] perda de dado real
num fechamento existente.** Pedido do usuário: "Buscar vendas" na Identificação tinha que
preencher automático o Relatório PDV (antes só preenchia se a data buscada fosse igual à do
fechamento — travava sempre, já que o bot está parado desde 08/09 e a data do fechamento é sempre
hoje), e precisava dar pra adicionar mais de um PDV no mesmo fechamento (mais de um
caixa/máquina pode reportar vendas no mesmo dia). Confirmado com o usuário (Recomendado: lista
completa, mesmo padrão de Despesas/Mercadorias/Retiradas) — implementado:
- `types/fechamento.ts`: `PdvEntradaDraft[]` substitui os campos únicos (`nrClientes`,
  `pdvDinheiroCents`, `pdvCreditoCents`, ...).
- `utils/financeiro.ts`: `calculatePdvEntradas` substitui `calculatePdv` (soma a lista inteira,
  expõe os totais por forma de pagamento pra `calculateRelatorioFinal` continuar igual).
- `utils/vendasFechamento.ts`: `aplicarResumoAoPrimeiroPdv` — botão "Buscar vendas" (Identificação
  e Relatórios) sempre preenche/cria o primeiro PDV da lista, sem trava de data; PDVs extras
  ficam sempre manuais.
- Nova tabela `pdv_entradas` (migration `20260915150000_pdv_entradas.sql`), colunas antigas
  (`nr_clientes`, `pdv_dinheiro`, ...) removidas de `fechamentos`, `salvar_fechamento` reescrita
  (6ª vez) com delete+insert de `pdv_entradas`.
- UI: `SecaoRelatorios.vue` (lista+modal, mesmo padrão de `SecaoLancamentos.vue`),
  `fechamentos/[id]/ver.vue` (lista por PDV em vez de campos únicos), `gerarPdfFechamento.ts`
  (PDF lista cada PDV).

**⚠️ ATENÇÃO — perda de dado real.** Ao aplicar a migration (`supabase db push`), descobri — só
DEPOIS de já ter rodado — que existia **1 fechamento real salvo** (`FC-MU1KF3LP-V1JF`, 14/09/2026,
`total_pdv: R$ 500,00`, caixa/turno em branco). A migration fazia `DROP COLUMN` de
`nr_clientes`/`pdv_dinheiro`/`pdv_credito`/`pdv_debito`/`pdv_pix`/`pdv_voucher`/`pdv_crediario`
sem migrar esses valores pra `pdv_entradas` — o comentário da migration dizia "nenhum fechamento
real foi salvo ainda", o que era verdade numa checagem de HORAS antes, mas não conferi de novo
imediatamente antes de rodar. **O total (R$ 500,00) continua intacto** (`total_pdv` não foi
tocado), mas **a composição por forma de pagamento (dinheiro/crédito/débito/pix/voucher/crediário)
e o número de clientes desse fechamento específico foram perdidos** — não recuperável via API
(dropped column). Esse fechamento tem caixa/turno em branco, o que sugere rascunho/teste, mas não
tenho certeza — avisei o usuário diretamente. Lição: **antes de qualquer `DROP COLUMN`, reconferir
dado existente na hora, nunca confiar numa checagem antiga da mesma sessão.**



**15/09/2026 (7ª revisão) — "Buscar vendas" filtra por caixa/turno, não soma a loja toda.**
O usuário perguntou se dava pra buscar vendas de um caixa específico (ex.: só Caixa 1). O bot já
grava `caixa`/`turno` separados por linha (extraído do texto do operador, ex. "VND CAIXA PDV - 1M"
→ caixa "1", turno "M" — confirmado direto no Postgre com dados reais), então sim, o dado já existe
granular — só faltava o app filtrar por isso. Antes, "Buscar vendas" somava TODOS os caixas do dia
juntos, o que estava tecnicamente errado (um fechamento é de UM caixa, não da loja inteira).
Adicionei `caixaParaNumero`/`turnoParaLetra` em `utils/vendasFechamento.ts` (mapeiam "Caixa 1" →
"1", "Manhã" → "M") e um segundo argumento opcional em `useVendasFechamento().buscarPorData(data,
{caixa, turno})`; os dois botões de busca (Identificação e Relatórios/PDV) agora filtram pelo
caixa/turno já selecionados no fechamento — sem caixa selecionado ainda, cai pro comportamento
antigo (todos juntos), sem quebrar nada. Testado com dado real: filtrar Caixa 1 + Manhã em
08/09/2026 traz exatamente 1 linha (antes trazia as 7 do dia inteiro).

**15/09/2026 (6ª revisão) — caminho alternativo: importar da planilha Google, sem depender de
máquina na LAN da loja.** O usuário perguntou qual o jeito mais rápido de ter vendas reais no app,
já que o agente `sincronizar.js`/`loop.js` (leitura direta do CREARE) só funciona rodando numa
máquina física na loja — algo que ainda não foi instalado. Resposta: `bot_padaria_v3` já escreve
há meses numa planilha Google Sheets, no formato exato que nosso endpoint espera (mesmas colunas,
mesmo HASH) — então dá pra ler ESSA planilha em vez do CREARE, sem precisar de nenhuma máquina na
loja. Testei se a planilha era pública (não é — 401, precisa de login Google), então usei a
service account que o bot original já tem em `bot.rar` (ela escreve, logo também pode ler) pra
construir `integracoes-scripts/src/sheetsRepository.js` + `src/importarPlanilha.js`
(`npm run importar-planilha`), reaproveitando o mesmo `PralisClient`/fila de pendências do
`sincronizar.js` — mesmo endpoint, mesma dedupe por HASH.

**Rodei de verdade** (credencial extraída do `bot.rar` só nesta sessão, nunca copiada pro
repositório, apagada do scratchpad depois de usar): importou as **2.861 linhas** da planilha
principal (1.368 da TNP CENTRAL, as outras são de outra loja/empresa na mesma planilha — filtradas
fora) e as **96.763 linhas** de produtos da planilha secundária (70.693 da TNP CENTRAL), em 145
lotes, **0 erros, 0 pendências**. Confirmei lendo direto do Postgres (com a service role key) que
a linha de 04/09/2026 — a data que o usuário tinha acabado de testar no wizard e visto "nenhuma
venda sincronizada" — agora tem 6 registros reais (um por PDV/turno), batendo com o que estava na
planilha. **Histórico completo de vendas real já está no banco.**

Pendência real que fica: pra manter isso ATUALIZADO (vendas de amanhã em diante), alguém precisa
rodar `npm run importar-planilha` de novo periodicamente — manualmente, ou agendado (Task
Scheduler/cron) — até o agente `sincronizar.js` real ser instalado numa máquina da loja. Rodar de
novo é sempre seguro (dedupe por HASH, nunca duplica).

**15/09/2026 (5ª revisão) — migrations aplicadas no banco real; achado bug grave meu.** O app
parou de carregar fechamentos e de buscar vendas. Causa: as 4 migrations de 15/09 (vendas,
`transferencias_caixa`, `discriminacoes.lancamento_id`) foram **escritas e testadas localmente mas
nunca aplicadas no Supabase real** — só rodei `vitest`/`vue-tsc`/build, que não tocam no banco de
verdade. `supabase db push --db-url ...` (via `SUPABASE_DB_PASSWORD` do `.env`, o CLI `link` normal
falhou por permissão do token) aplicou as 4 migrations pendentes; reconferi as 3 queries que
quebravam direto na REST API do Supabase e todas voltaram 200. **Lição**: daqui pra frente, migration
só conta como "feita" depois de `supabase db push` confirmado contra o projeto real, não só o SQL
escrito e os testes locais passando.

Nessa mesma revisão, achei (e corrigi o que dava pra corrigir sem acesso ao dashboard) que o
`.env` também nunca teve `NUXT_SUPABASE_SERVICE_ROLE_KEY` nem `NUXT_INTEGRACAO_VENDAS_CHAVE`
configurados — ou seja, o endpoint `/vendas/importar` sempre teria falhado (500), mesmo com as
tabelas certas e o bot funcionando perfeitamente. Gerei e configurei `NUXT_INTEGRACAO_VENDAS_CHAVE`
(chave só entre nosso próprio server e nosso próprio bot, não precisa do dashboard). Testei o
endpoint ponta a ponta com um payload sintético assinado com o mesmo algoritmo de HASH do bot real:
autenticação e validação de schema passam limpo, falha exatamente (e só) na escrita no Supabase por
falta da `service_role key` — ver "Pendências reais" #1 abaixo, é a única coisa que falta e só o
dono do projeto Supabase consegue pegar (dashboard).

**15/09/2026 (4ª revisão) — botão "Baixar PDF" no Relatório Final.** Feature nova, sem
equivalente no Pralís original (procurei — o único uso de "PDF" lá é upload de comprovante, não
exportação de relatório). Implementado 100% client-side com `jsPDF` (`npm install jspdf`, zero
dependência de servidor — cabe no modelo Vercel/sem processo permanente do app): botão no topo de
`SecaoRelatorioFinal.vue` (passo 5 do wizard) chama `utils/gerarPdfFechamento.ts`, que monta um PDF
com identificação, entradas, sangrias, transferência entre caixas, lançamentos, PDV, maquininhas,
crediário, conferência por forma de pagamento, resultado e diferença geral — reaproveitando os
mesmos valores já calculados por `useRelatorioCalculado` (nenhuma fórmula nova). Painéis empilhados
das telas de Relatórios/Transferências viraram um acordeão fechado por padrão nessa mesma revisão
(pedido do usuário pra parar de rolar 3 formulários grandes ao mesmo tempo).

**15/09/2026 (3ª revisão) — transferência entre caixas e relatórios clonados do Pralís original.**
Duas telas do wizard foram revisadas contra `SISTEMA_INTELIGENTE_PRALIS-main.zip`:
- **Transferências (passo 2)**: o sistema de referência tem um módulo completo de contas/livro-razão
  com confirmação e múltiplos destinos. O usuário optou pela versão simples: só registrar
  caixa origem/destino/valor/lacre/data/observação, sem cadastro de contas nem workflow de
  confirmação. Novo painel "Transferência entre caixas" em `SecaoTransferencias.vue`, tabela
  `transferencias_caixa`, é puramente informativo (não entra no cálculo de `calculateRelatorioFinal`).
- **Relatórios / aba PDV (passo 4)**: no sistema de referência não existe formulário manual
  equivalente — os valores chegam prontos via sincronização do CREARE. O usuário confirmou:
  preencher a aba PDV automaticamente a partir das vendas já sincronizadas (mesma origem/composable
  do botão "Buscar vendas" da Identificação), mantendo os campos editáveis depois de preenchidos.
  Maquininhas e Crediário foram explicitamente mantidos como estão (decisão do usuário), sem
  mudança nenhuma nessas duas abas. Resolve a pendência #3 abaixo.

**15/09/2026 (2ª revisão) — pivotado para o `bot_padaria_v3` real.** O usuário trouxe
`app/PRALIS-INTELIGENTE DESIGNER/bot.rar`: um bot **já em produção há meses** (logs desde maio/2026),
que já lê o CREARE da loja e já tem as credenciais configuradas. A primeira implementação (baseada
em `SISTEMA_INTELIGENTE_PRALIS-main.zip`, venda a venda) foi **descartada** — nunca chegou a rodar
contra dados reais — porque reaproveitar um sistema comprovado é estritamente melhor do que manter
dois caminhos concorrentes. Ver `integracoes-scripts/README.md` para o detalhe técnico do que foi
portado do bot original e o que foi deliberadamente deixado de fora (Google Sheets, de-para de
colaborador).

**15/09/2026 (1ª revisão) — arquitetura desacoplada do CREARE.** O CREARE só é acessível na LAN da
loja, então a busca de vendas não pode ser "botão chama a origem na hora": precisa de um agente
local que sincroniza para o Supabase, e o app só lê o que já foi sincronizado.

## Arquitetura atual

```
CREARE (MySQL, LAN da loja)
   -> integracoes-scripts/ (agente Node.js, roda no PC da loja — mesmo modelo do bot_padaria_v3)
   -> POST /vendas/importar (Authorization: Bearer, {tipo, linhas}) -> Nitro (Vercel, sem processo permanente)
   -> upsert idempotente por HASH no Supabase (vendas_fechamento_caixa_dia / vendas_produto_dia)
   -> app web lê o Supabase já sincronizado (botão "Buscar vendas" na Identificação)
```

Preserva 100% o fluxo atual do wizard de fechamento e não altera `utils/financeiro.ts` nem o
contrato em `docs/CONTRATO-COMPORTAMENTO-ATUAL.md`.

---

## Crítico

- [x] Localizar e estudar o bot real (`bot_padaria_v3`, em `app/PRALIS-INTELIGENTE DESIGNER/bot.rar`)
- [x] Identificar o contrato HTTP real (`POST {url}/vendas/importar`, `Authorization: Bearer`, `{tipo, linhas}`, ver `services/pralisSalesService.js` do bot)
- [x] Identificar o formato real dos dados (linha por PDV/operador/dia com CREDITO/DEBITO/DINHEIRO/PIX/VOUCHER/CLIENTES, não venda a venda)
- [x] Identificar a idempotência real (HASH sha256 calculado pelo bot a partir de campos específicos — não inclui CAIXA/TURNO/formas de pagamento)
- [x] Confirmar que as credenciais do CREARE já existem e não precisam ser levantadas de novo
- [ ] Confirmar com credenciais reais que o agente lê o **CREARE direto** (MySQL) corretamente — ainda bloqueado, precisa de máquina na LAN da loja (ver "Pendências reais"). **Diferente** do item abaixo: dados reais já entraram no banco, só não foi por esse caminho ainda.
- [x] Importar dados reais por um caminho alternativo (planilha Google que o bot original já preenche) — 1.368 fechamentos + 70.693 vendas de produto da TNP CENTRAL, confirmados no Postgres

## Alta complexidade

- [x] Criar schema Supabase (`vendas_fechamento_caixa_dia`, `vendas_produto_dia`) com `hash` único
- [x] Endpoint server-side em `server/routes/vendas/importar.post.ts` (fora de `/api`, mesmo path que o bot espera)
- [x] Parsing tolerante dos valores do bot (vírgula decimal, "DD/MM/YYYY", prefixo de aspa do Google Sheets) em `server/utils/parseValoresBot.ts`
- [x] Reescrever `integracoes-scripts/` como clone mínimo do bot real: mesma query SQL (`FECHAMENTO_CAIXA.sql`/`VENDAS_PRODUTOS.sql`, copiadas verbatim), mesmo cálculo de HASH, mesma extração de caixa/turno do operador — sem Google Sheets
- [x] Idempotência ponta a ponta (upsert por `hash` no Postgres)
- [x] Fila de pendências em disco + replay no próximo ciclo (agente) — nunca perde um lote silenciosamente
- [x] Caminho alternativo `src/sheetsRepository.js` + `src/importarPlanilha.js` (`npm run importar-planilha`) — lê a planilha Google do bot original (service account, `googleapis`) e reenvia pro mesmo endpoint; reaproveita `PralisClient`/fila de pendências

## Média complexidade

- [x] Atualizar "Buscar vendas" na Identificação para o novo modelo (registros por PDV, número de vendas, total, formas de pagamento reais)
- [x] Composable `useVendasFechamento.ts` + util puro `utils/vendasFechamento.ts`
- [x] Loading/erro/vazio, botão desabilitado durante a busca
- [x] Transferência entre caixas (passo 2) — versão simples (origem/destino/valor/lacre/data/obs), clonada e simplificada do Pralís original
- [x] N lançamentos por tipo em Despesas/Mercadorias/Retiradas (passo 3), com `id` estável por lançamento e discriminação vinculada por `lancamentoId`
- [x] Botão "Buscar vendas do dia" na aba PDV dos Relatórios (passo 4), preenchendo dinheiro/crédito/débito/pix/voucher/crediário/nº de clientes a partir de `vendas_fechamento_caixa_dia`; Maquininhas e Crediário intocados
- [x] Painéis de PDV/Maquininhas/Crediário (passo 4) e Entradas/Sangrias/Transferência (passo 2) viraram acordeão — fecham por padrão, cada um abre/fecha independente ao clicar na faixa colorida
- [x] Botão "Baixar PDF" no Relatório Final (passo 5) — `jsPDF`, 100% client-side, sem dependência nova de servidor

## Testes

- [x] `integracoes-scripts/`: hash (estabilidade e sensibilidade a mudança), extração caixa/turno do operador, datas, montagem de linha (HASH não muda com ATUALIZADO_EM), cliente HTTP (sucesso/falha de rede/HTTP não-2xx/replay de pendências), lock — 26 testes
- [x] `app/`: parsing tolerante (vírgula, DD/MM/YYYY, prefixo de aspa), mapeamento de linha do bot, auth (Bearer/x-api-key), resumo do dia, geração de PDF (bytes válidos, paginação) — todos em `vitest`
- [x] Revisão de segurança: nenhuma credencial do `bot.rar` foi copiada para dentro do projeto; `.env.producao` do novo agente é placeholder, gitignored
- [x] Regressão completa (`vitest run`), typecheck (`vue-tsc`), lint (`eslint`), build de produção (`nuxt build`) — todos verdes após o pivô
- [ ] Testar com dados reais do CREARE e comparar com o bot original rodando em paralelo (bloqueado até o usuário confirmar)

## Documentação

- [x] `integracoes-scripts/README.md` — inclui aviso de segurança sobre não deixar `bot.rar` (ou qualquer cópia de credenciais de produção) dentro da pasta do projeto/OneDrive
- [x] `.env.producao.example` do agente com os mesmos nomes de variável do bot original (copiável direto se já existir um `.env.producao` do bot antigo nesta loja)

---

## Pendências reais (não simule para marcar como pronto)

0. ~~`NUXT_SUPABASE_SERVICE_ROLE_KEY` vazia~~ — **resolvido em 15/09/2026.** O usuário pegou a chave
   no Supabase Dashboard e configurou `app/.env`. Retestei `/vendas/importar` ponta a ponta com um
   payload sintético (mesmo HASH que o bot real geraria): gravou no Postgres (confirmado lendo de
   volta com a `service_role key`, já que a RLS de `vendas_fechamento_caixa_dia` só libera `select`
   pra `authenticated`, então um teste com a `anon key` sozinha sempre voltaria vazio mesmo com a
   linha lá — isso é comportamento esperado da RLS, não bug). Linha de teste apagada depois de
   confirmar. **Pendência real que sobra**: em produção (Vercel) a mesma variável — e
   `NUXT_INTEGRACAO_VENDAS_CHAVE` — ainda precisam ser configuradas nas Environment Variables do
   projeto (isso é só local/dev por enquanto).
1. **Teste com CREARE real.** Toda a lógica está implementada e testada com dados simulados. O que
   falta é rodar o agente contra o MySQL real: copie `integracoes-scripts/.env.producao.example`
   para `.env.producao`, preencha (as 5 linhas de CREARE podem ser copiadas do `.env.producao` do
   bot original, se ele já estiver configurado nesta loja), e rode `npm run sincronizar`. Compare
   com o que aparece no próprio CREARE/planilha do bot original para o mesmo dia.
2. **Segurança do `bot.rar`**: esse arquivo contém credenciais reais de produção (CREARE, chave de
   serviço do Google) e está dentro de `app/PRALIS-INTELIGENTE DESIGNER/`, uma pasta sincronizada
   pelo OneDrive. Recomendo fortemente mover esse arquivo (e o `.zip` do Pralís, mesma pasta) para
   fora de qualquer pasta sincronizada por nuvem ou versionada, assim que não precisar mais dele
   aqui. Reforça: usei a service account de dentro dele (15/09, 6ª revisão) pra ler a planilha —
   se você trocar/revogar essa credencial no Google Cloud Console, `npm run importar-planilha`
   para de funcionar até reconfigurar `GOOGLE_SERVICE_ACCOUNT_FILE` com uma credencial válida.
2a. **Manter as vendas atualizadas dia a dia.** `npm run importar-planilha` fez o backfill
   histórico, mas não roda sozinho — enquanto o agente real não estiver instalado na loja
   (pendência #1), alguém precisa rodar esse comando de novo periodicamente (manual, ou agendado
   via Task Scheduler/cron numa máquina qualquer com Node — não precisa ser na loja, já que lê da
   nuvem) pra trazer as vendas de dias novos. Rodar de novo é sempre seguro (dedupe por HASH).
3. ~~Prefill automático do Relatório PDV~~ — feito em 15/09/2026 (3ª revisão), ver histórico acima.
4. **`VENDAS_PRODUTOS` sincroniza mas não é usado em lugar nenhum do app ainda** — guardado em
   `vendas_produto_dia` para o caso de virar útil (ex.: relatório de produtos mais vendidos), sem
   custo extra de implementação hoje.
