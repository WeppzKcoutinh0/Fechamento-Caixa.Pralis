# Migração para Coolify — 07/10/2026

## Estado atual

- Aplicação Nuxt 4 + Vue + Vuetify + Nitro publicada a partir do GitHub.
- Destino: Coolify no servidor `187.77.54.180`.
- Foi criado um Supabase self-hosted paralelo no projeto `Cicluz`.
- O armazenamento usa backend local em arquivo (`/var/lib/storage`).
- As migrations do repositório foram aplicadas em ordem no banco novo (`MIGRATIONS_OK`).
- Conforme autorizado, os dados e logins antigos não foram restaurados.
- O app foi publicado no Coolify no commit `9f9561d` e está em execução.

## Backup gerado

Foram gerados localmente, sem alteração no banco de origem:

- `backups/supabase-2026-10-07/public-data.sql`
- `backups/supabase-2026-10-07/auth-data.sql`
- `backups/supabase-2026-10-07/storage-data.sql`

Esses arquivos contêm dados reais e estão bloqueados pelo `.gitignore`.

## Validações concluídas

- Schema, tabelas, funções RPC e bucket `anexos` foram validados no banco novo.
- O app responde HTTP 200 na URL gerada pelo Coolify.
- O cron `Sincronizar vendas Creare` foi criado com `0 8 * * *`, substituindo o cron da Vercel.
- O `.mcp.json` do Playwright MCP foi adicionado ao projeto.

## Pendências manuais antes do uso real

1. Criar as novas contas admin/caixa no Supabase novo e testar cada perfil.
2. Informar no Coolify as credenciais do Google Sheets: `NUXT_GOOGLE_SERVICE_ACCOUNT_JSON`,
   `NUXT_GOOGLE_SPREADSHEET_ID` e, se aplicável, `NUXT_GOOGLE_SPREADSHEET_ID_SECUNDARIO`.
3. Configurar um domínio HTTPS definitivo; a URL `sslip.io` é adequada para teste, não para
   operação definitiva.
4. Validar uma sincronização real e um fechamento de teste antes de desligar Vercel/Supabase.
