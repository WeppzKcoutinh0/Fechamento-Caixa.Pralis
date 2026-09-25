# Sincronização de vendas CREARE -> Pralis (Fechamento de Caixa)

Agente que lê o banco do PDV **CREARE/Compilart** (MySQL, na própria loja) e envia o resumo diário
de vendas por caixa/PDV/operador para o app (`POST /vendas/importar`). Roda na máquina da loja.

**Mesmo modelo do `bot_padaria_v3`** (o bot que já está em produção há meses — ver
`app/PRALIS-INTELIGENTE DESIGNER/bot.rar`): mesma query SQL, mesmo cálculo de HASH pra
idempotência, mesmo contrato HTTP (`Authorization: Bearer`, `{tipo, linhas}`,
`POST {url}/vendas/importar`). Duas diferenças deliberadas:

- **Sem Google Sheets.** O bot original grava numa planilha e manda pro Pralis como efeito
  colateral do mesmo ciclo. Este agente só faz a parte do Pralis — não escreve em nenhuma
  planilha, não depende de credencial do Google.
- **Sem de-para de operador -> colaborador.** Aquele mapeamento vinha de uma aba da planilha
  (`DE_PARA_OPERADORES`). Aqui o campo `COLABORADOR` sai vazio — o app mostra por PDV/turno, que
  já vem de graça do próprio texto do operador (`interpretarOperador`), sem precisar de cadastro.

## Caminho rápido: importar da planilha Google (sem precisar de máquina na loja)

Enquanto este agente não está instalado numa máquina da LAN da loja, dá pra puxar vendas **reais**
agora mesmo lendo a mesma planilha Google Sheets que o `bot_padaria_v3` original já preenche há
meses — os dados já existem lá (histórico completo), no formato exato que o endpoint espera
(mesmas colunas, mesmo HASH). `npm run importar-planilha` lê a planilha e reenvia pro mesmo
`/vendas/importar`, reaproveitando a mesma fila de pendências/retry do `sincronizar.js`.

Precisa, no `.env.producao`:

| Variável                          | Descrição                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_FILE`      | caminho do `.json` da service account do bot original (ela já pode ler, mesma credencial que ele usa pra escrever) — **fora do git/OneDrive** |
| `GOOGLE_SPREADSHEET_ID`            | ID da planilha principal (aba `FECHAMENTOS_CAIXAS`)                        |
| `GOOGLE_SPREADSHEET_ID_SECUNDARIO` | ID da planilha secundária, só se `VENDAS_PRODUTOS` foi movido pra lá (ver `config.yaml` do bot original) |
| `COLUNA_INICIAL`                   | a partir de qual coluna a planilha tem dados (default `F`, igual o bot original) |

```bash
npm run importar-planilha
```

Filtra só as linhas da `EMPRESA` configurada (a planilha pode ter mais de uma loja misturada) e
deduplica por HASH igual o `sincronizar.js` — rodar de novo nunca duplica nada. Bom tanto pra um
backfill único (histórico) quanto pra rodar periodicamente (manual ou agendado) até o agente real
estar instalado na loja.

**Segurança**: o arquivo `.json` da service account é um segredo de produção (mesma categoria do
`bot.rar` — ver seção Segurança no fim deste README). Guarde fora do projeto/OneDrive, nunca
commite, e referencie só o caminho no `.env.producao` (que também não vai pro git).

## Se você já tem o bot_padaria_v3 rodando nesta loja

As credenciais do CREARE são as **mesmas** — copie as 5 linhas `*_CREARE_COMPILART` do
`.env.producao` daquele bot pro `.env.producao` deste agente. Você **não precisa pedir essas
credenciais de novo pra ninguém**.

## 1. Configurar o `.env.producao`

Copie `.env.producao.example` para `.env.producao` (fora do git) e preencha:

| Variável                                              | Descrição                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `SERVIDOR_CREARE_COMPILART`                            | host do MySQL do CREARE (mesma do bot_padaria_v3, se já existir)    |
| `PORTA_CREARE_COMPILART`                               | porta (default `3306`)                                              |
| `BANCO_CREARE_COMPILART`                               | nome do banco                                                        |
| `USUARIO_CREARE_COMPILART` / `SENHA_CREARE_COMPILART`  | credenciais do MySQL                                                 |
| `EMPRESA`                                              | rótulo da loja (ex.: `"TNP CENTRAL"`) — vai na coluna EMPRESA         |
| `PRALIS_VENDAS_API_URL`                                | URL do app na Vercel                                                  |
| `PRALIS_VENDAS_API_TOKEN`                              | mesmo valor de `NUXT_INTEGRACAO_VENDAS_CHAVE` configurado no app      |
| `SYNC_INTERVALO_MINUTOS`                               | intervalo do loop (default `10`)                                     |
| `SYNC_DIAS_REPROCESSAR`                                | quantos dias pra trás reler a cada ciclo (default `3`)                |
| `SYNC_LOCK_MAX_MINUTOS`                                | idade máxima do lock (default `30`)                                  |
| `SYNC_RETRY_TENTATIVAS` / `SYNC_RETRY_BASE_MS`         | retry de rede por lote (default `4` / `500`)                         |
| `SYNC_ENVIAR_PRODUTOS`                                 | também sincronizar vendas por produto? (default `true`)              |
| `SYNC_ENVIAR_VENDAS`                                   | também sincronizar venda a venda (itens + pagamentos) — fonte de verdade de "Vendas canceladas"? (default `true`) |
| `SYNC_ESTADO_DIR`                                      | pasta do estado de runtime (default `.estado`)                       |

## Fluxo oficial de vendas (25/09/2026)

Além de `fechamento_caixa_dia` (totais por caixa/hora) e `venda_produto_dia` (agregado por
produto/dia, só pra "produtos vendidos no dia"), o agente agora também envia `venda_creare`: uma
linha POR VENDA (não agregada), com itens e pagamentos — é a fonte de verdade de "Vendas
canceladas" no Caixa. Upsert por `CREARE:<ID_VENDA_BALCAO>` (não por hash de conteúdo): uma venda
que muda de FINALIZADA pra CANCELADA depois atualiza a MESMA linha no próximo ciclo, em vez de
criar uma duplicada — por isso o ciclo relê o dia inteiro (`SYNC_DIAS_REPROCESSAR`), nunca depende
de um cursor incremental.

Pra ver cancelamentos quase em tempo real, recomendado `SYNC_INTERVALO_MINUTOS="1"` (em vez do
default `10`) quando `SYNC_ENVIAR_VENDAS` estiver ligado.

Depois de cada envio, o agente confere (best-effort, nunca derruba o ciclo) se toda venda que ele
leu como CANCELADA no CREARE realmente existe como CANCELADA no sistema — loga um aviso se faltar
alguma (`POST /vendas/conciliar-canceladas`). Uma venda sem `ID_VENDA_BALCAO` na origem nunca
ganha um ID inventado: fica registrada em `vendas_importacao_inconsistencias` pra correção manual.

## 2. Instalar e testar

```bash
npm ci
npm run sincronizar   # roda UM ciclo (bom para o primeiro teste)
```

Cada ciclo imprime um resumo:

```
[sincronizar] fechamento_caixa_dia: desde=2026-08-18 lidas=12 lotes=1 enviados=1 pendentes=0
[sincronizar] venda_produto_dia: desde=2026-08-18 lidas=340 lotes=1 enviados=1 pendentes=0
```

## Como funciona

- **Reprocesso por janela, não por dia isolado**: cada ciclo relê o CREARE desde
  "hoje menos `SYNC_DIAS_REPROCESSAR` dias" até agora — a própria query SQL já agrupa por dia, PDV
  e operador, então uma chamada só devolve todos os dias da janela, resumidos. Reenviar dias já
  sincronizados é sempre seguro.
- **Idempotente por HASH**: cada linha carrega um hash (sha256) calculado a partir dos campos que
  identificam aquela linha (dia, PDV, operador, primeira/última venda, contagem, total). O endpoint
  faz upsert por esse hash — reenviar não duplica.
- **Fila de pendências em disco** (`.estado/pendentes/`): lote que falhou (rede, HTTP != 2xx) fica
  salvo e é reenviado no início do próximo ciclo. Nunca é descartado silenciosamente.
- **Lock** (`.estado/agente.lock`): impede duas execuções simultâneas. Lock de processo morto ou
  com mais de `SYNC_LOCK_MAX_MINUTOS` é considerado abandonado e roubado.

## Rodar como serviço no Windows

### Opção A — NSSM (recomendado): loop contínuo

1. Baixe o **NSSM** em nssm.cc e extraia.
2. `nssm install FechamentoCaixaSincronizacao`
3. Na janela do NSSM:
   - **Application Path**: caminho do `node.exe`.
   - **Startup directory**: a pasta `integracoes-scripts`.
   - **Arguments**: `--env-file-if-exists=.env.producao src/loop.js`
   - Aba **I/O**: aponte _Output_/_Error_ para um arquivo de log.
4. `nssm start FechamentoCaixaSincronizacao`.

### Opção B — Agendador de Tarefas: um ciclo periódico

1. Crie uma tarefa que executa, na pasta `integracoes-scripts`:
   `node.exe --env-file-if-exists=.env.producao src/sincronizar.js`
2. Gatilho: repetir a cada `SYNC_INTERVALO_MINUTOS`.

## Testes

```bash
npm test    # node:test — hash, operador (caixa/turno), datas, montagem de linha, cliente HTTP, lock
```

**Não cobre** a leitura real do MySQL do CREARE nem uma corrida completa contra o app publicado —
isso só é validável com credenciais reais (ver `TASKS.md` na raiz do projeto).

## Segurança

`.env.producao` nunca vai para o git (ver `.gitignore`). Se você copiou as credenciais do
`bot_padaria_v3` original, **não deixe o pacote de onde elas vieram** (ex.: um `.rar`/`.zip` com o
código daquele bot) parado dentro da pasta do projeto nem em qualquer lugar sincronizado por
nuvem — ele contém segredos de produção reais (banco, chave de serviço do Google). Mova-o para um
lugar seguro fora do projeto depois de copiar o que precisar.
