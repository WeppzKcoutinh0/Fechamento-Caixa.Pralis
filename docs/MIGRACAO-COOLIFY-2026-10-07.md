# Migração para Coolify — 07/10/2026

## Estado atual

- Aplicação: Nuxt 4 + Vue + Vuetify + Nitro, com Dockerfile já existente.
- Origem: GitHub, Supabase Cloud e Vercel.
- Destino: Coolify no servidor `187.77.54.180`.
- O projeto `Cicluz` já possui uma aplicação Docker Compose.
- Foi criado no projeto `Cicluz` um serviço Supabase self-hosted paralelo para validação.
- O primeiro deploy desse serviço falhou ao baixar `minio/mc`; nenhum dado foi importado.

## Backup gerado

Foi gerado localmente, sem alteração no banco de origem:

- `backups/supabase-2026-10-07/public-data.sql`
- `backups/supabase-2026-10-07/auth-data.sql`
- `backups/supabase-2026-10-07/storage-data.sql`

Esses arquivos contêm dados reais e estão bloqueados pelo `.gitignore`. Não devem ser enviados ao GitHub, Vercel, chat ou compartilhados por mensagem.

## Dependências que precisam ser preservadas

O sistema não depende apenas de PostgreSQL. Ele usa Supabase Auth, PostgREST, RLS, RPCs, Storage, Realtime e `auth.uid()`. A migração correta precisa manter a instalação Supabase completa ou substituir toda essa arquitetura.

Há 71 migrations em `supabase/migrations`, tabelas com referências a `auth.users`, o bucket privado `anexos` e funções financeiras com `SECURITY DEFINER`.

## Próximas etapas seguras

1. Corrigir o template self-hosted no Coolify e fazer todos os containers ficarem saudáveis.
2. Configurar domínio HTTPS para Kong/API, Studio e o app.
3. Aplicar as migrations na ordem, sem executar `db reset` no ambiente real.
4. Restaurar dados `auth`, `public` e metadados `storage` preservando UUIDs.
5. Copiar os arquivos binários do bucket `anexos` separadamente.
6. Validar login, RLS, RPCs, anexos, importação de vendas e exportação de planilhas.
7. Publicar o app no Coolify apontando para a nova URL Supabase.
8. Configurar o cron de importação que hoje existe apenas na Vercel.
9. Atualizar o agente CREARE para a nova URL somente após o teste paralelo.
10. Manter Supabase/Vercel antigos como rollback até a validação final.

## Playwright MCP

Foi adicionado `.mcp.json` com o servidor oficial `@playwright/mcp@latest` em modo extensão. O cliente MCP precisa reiniciar/recarregar o projeto para reconhecer a configuração. A extensão/conexão do navegador ainda precisa estar habilitada no cliente usado.
