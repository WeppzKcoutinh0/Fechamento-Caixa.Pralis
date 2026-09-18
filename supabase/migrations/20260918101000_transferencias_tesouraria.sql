-- Pedido do usuário (18/09/2026): uma "Nova Transferência" independente de qualquer fechamento
-- (tipo tesouraria/cofre central — Origem "Cofre" -> Destino "PDV ativo", inspirado no sistema
-- Pralís) — diferente de `transferencias_caixa` (que É ligada a um fechamento específico e
-- continua existindo, sem mudança, só informativa). O objetivo principal: cada transferência tem
-- um N° Lacre único, e quando um caixa lança uma Entrada com esse MESMO lacre (ver
-- `SecaoTransferencias.vue`), o valor é buscado aqui automaticamente e somado em Entradas — o
-- "cadastro de lacres com valor pré-definido" pedido pelo usuário É esta tabela.
create table public.transferencias_tesouraria (
  id uuid primary key default gen_random_uuid(),

  valor numeric(14, 2) not null default 0,
  -- Chave de busca do lookup automático — cada lacre é um selo físico único, então tem que ser
  -- único aqui pra a busca ser inequívoca.
  lacre text not null,

  -- Sem default de banco (mesmo motivo de `cash_sessions.business_date`: `current_date` do
  -- Postgres é UTC, o app é hora local do navegador) — cliente sempre manda `hojeISO()`.
  data_lanc date not null,

  -- "Agendamento": marca que o recebimento ainda não foi confirmado — vira concreto quando
  -- `confirmado_em`/`data_recebimento` são preenchidos (só por uma ação explícita de confirmar,
  -- nunca por um campo de data digitado à mão — mesma regra de todos os outros campos de data
  -- do app, travados no dia atual).
  agendamento boolean not null default false,
  data_recebimento date,
  confirmado_em timestamptz,
  confirmado_por uuid references auth.users (id),

  caixa_origem text not null check (caixa_origem in ('Cofre', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4')),
  caixa_destino text not null check (caixa_destino in ('Cofre', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4')),

  multiplo_destino boolean not null default false,
  -- [{ caixa: text, valor: numeric }] — só usado quando multiplo_destino = true.
  destinos_extra jsonb not null default '[]'::jsonb,

  tempo_confirmacao boolean not null default false,
  -- "Transferência de retorno": só marcável quando origem = Cofre e destino != Cofre (checado no
  -- client, mesma regra do formulário de referência) — liga a transferência de volta gerada.
  transferencia_retorno boolean not null default false,
  transferencia_retorno_id uuid references public.transferencias_tesouraria (id),

  observacao text not null default '',

  criado_por uuid not null default auth.uid() references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index transferencias_tesouraria_lacre_idx on public.transferencias_tesouraria (lacre);
create index transferencias_tesouraria_data_lanc_idx on public.transferencias_tesouraria (data_lanc);

alter table public.transferencias_tesouraria enable row level security;

-- Select aberto pra todo `authenticated` (não só admin) — é o que permite o lookup automático
-- por lacre dentro do wizard de qualquer conta CAIXA (`SecaoTransferencias.vue`, campo Lacre da
-- Entrada). Escrita (criar/editar/confirmar/excluir) fica só com o admin — o formulário de
-- criação vive na tela `/transferencias`, que só o admin acessa.
create policy "transferencias_tesouraria_select" on public.transferencias_tesouraria
  for select
  to authenticated
  using (true);

create policy "transferencias_tesouraria_insert" on public.transferencias_tesouraria
  for insert
  to authenticated
  with check (public.is_admin());

create policy "transferencias_tesouraria_update" on public.transferencias_tesouraria
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "transferencias_tesouraria_delete" on public.transferencias_tesouraria
  for delete
  to authenticated
  using (public.is_admin());
