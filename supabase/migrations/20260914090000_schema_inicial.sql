-- Schema inicial do Fechamento de Caixa.
-- Espelha 1:1 o modelo de dados do sistema atual (ver docs/CONTRATO-COMPORTAMENTO-ATUAL.md),
-- incluindo os campos hoje "mortos" (nunca persistidos no localStorage), para corrigir a perda
-- de dados na edição sem inventar nenhum campo novo. Nenhum valor/enum aqui foi inventado —
-- todos vêm literalmente dos `value=` usados hoje no HTML.

create extension if not exists pgcrypto;

-- ─── FECHAMENTOS (linha principal) ──────────────────────────────────────────
create table public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, -- equivalente ao "FC-xxxxx-xxxx" gerado hoje no client
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- Seção 1 — Identificação
  data date not null,
  caixa text not null check (caixa in ('Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4')),
  turno text not null check (turno in ('Manhã', 'Tarde')),
  responsavel text not null default '',

  -- Seção 2 — Transferências (totais; itens em tabelas próprias)
  total_entrada numeric(14, 2) not null default 0,
  total_saida numeric(14, 2) not null default 0, -- == total_sangria (campo redundante preservado)

  -- Seção 4 — Relatório PDV
  relatorio_pdv text not null default '', -- hoje nunca salvo (campo morto) — agora persistido
  nr_clientes integer not null default 0,
  ticket_medio numeric(14, 2) not null default 0,
  pdv_dinheiro numeric(14, 2) not null default 0,
  pdv_credito numeric(14, 2) not null default 0,
  pdv_debito numeric(14, 2) not null default 0,
  pdv_pix numeric(14, 2) not null default 0,
  pdv_voucher numeric(14, 2) not null default 0,
  pdv_crediario numeric(14, 2) not null default 0,
  total_pdv numeric(14, 2) not null default 0,
  img_pdv_path text, -- caminho no Storage; hoje nunca salvo (campo morto) — agora persistido

  -- Seção 4 — Maquininhas (bruto manhã/tarde; hoje só os líquidos são salvos)
  nr_maquininha text not null default '',
  manha_inicial numeric(14, 2) not null default 0,
  tarde_final numeric(14, 2) not null default 0,
  credito_manha numeric(14, 2) not null default 0,
  debito_manha numeric(14, 2) not null default 0,
  pix_manha numeric(14, 2) not null default 0,
  voucher_manha numeric(14, 2) not null default 0,
  img_manha_path text,
  credito_tarde numeric(14, 2) not null default 0,
  debito_tarde numeric(14, 2) not null default 0,
  pix_tarde numeric(14, 2) not null default 0,
  voucher_tarde numeric(14, 2) not null default 0,
  img_tarde_path text,
  liq_credito numeric(14, 2) not null default 0,
  liq_debito numeric(14, 2) not null default 0,
  liq_pix numeric(14, 2) not null default 0,
  liq_voucher numeric(14, 2) not null default 0,

  -- Seção 4 — Crediário (totais; itens em tabela própria)
  total_cred_clientes numeric(14, 2) not null default 0,
  total_cred_colab numeric(14, 2) not null default 0,
  total_crediario numeric(14, 2) not null default 0,

  -- Seção 6 — Relatório Final
  rel_despesas numeric(14, 2) not null default 0,
  rel_mercadoria numeric(14, 2) not null default 0,
  rel_retiradas numeric(14, 2) not null default 0,
  rel_cartoes numeric(14, 2) not null default 0,
  valor_total_final numeric(14, 2) not null default 0,
  diferenca numeric(14, 2) not null default 0,
  rel_pdv_diferenca numeric(14, 2) not null default 0,

  -- Card aditivo "esperado x contado" (decisão do plano: não substitui `diferenca`)
  dinheiro_contado numeric(14, 2),
  saldo_fisico_esperado numeric(14, 2)
);

comment on table public.fechamentos is
  'Registro principal de um fechamento de caixa. Colunas espelham exatamente os campos do '
  'formulário atual (ver docs/CONTRATO-COMPORTAMENTO-ATUAL.md) — nenhuma fórmula ou rótulo '
  'foi alterado na migração.';

create index fechamentos_criado_em_idx on public.fechamentos (criado_em desc);
create index fechamentos_data_idx on public.fechamentos (data);

-- ─── ENTRADAS (lista dinâmica da seção 2) ───────────────────────────────────
create table public.entradas (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos (id) on delete cascade,
  ordem integer not null default 0,
  lacre text not null default '',
  valor numeric(14, 2) not null default 0,
  descricao text not null default ''
);

create index entradas_fechamento_id_idx on public.entradas (fechamento_id, ordem);

-- ─── SANGRIAS (lista dinâmica da seção 2) ───────────────────────────────────
create table public.sangrias (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos (id) on delete cascade,
  ordem integer not null default 0,
  descricao text not null default '',
  lacre text not null default '',
  valor numeric(14, 2) not null default 0
);

create index sangrias_fechamento_id_idx on public.sangrias (fechamento_id, ordem);

-- ─── LANÇAMENTOS (despesa/mercadoria/retirada, seção 3) ─────────────────────
create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos (id) on delete cascade,
  ordem integer not null default 0,
  tipo text not null check (tipo in ('despesa', 'mercadoria', 'retirada')),
  status text not null default 'naopago' check (status in ('pago', 'naopago')),
  data_ref date,
  data_nfe date,
  n_nfe text not null default '',
  fornecedor text not null default '',
  tipo_mer text check (tipo_mer in ('computado', 'nao_computado')),
  valor numeric(14, 2) not null default 0,
  obs_tipo text check (obs_tipo in ('texto', 'audio')),
  obs_texto text not null default '',
  obs_audio_path text, -- Storage; hoje base64 embutido no localStorage (implementado de verdade agora)
  foto_path text, -- Storage; hoje campo morto
  vencimento date,
  foto_nota_path text -- Storage; hoje campo morto
);

create index lancamentos_fechamento_id_idx on public.lancamentos (fechamento_id, ordem);
create index lancamentos_tipo_idx on public.lancamentos (fechamento_id, tipo);

-- ─── DISCRIMINAÇÕES (seção 5) ───────────────────────────────────────────────
create table public.discriminacoes (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos (id) on delete cascade,
  ordem integer not null default 0,
  tipo text not null check (tipo in ('mercadoria', 'despesa', 'retirada')),
  qtd numeric(14, 3) not null default 0,
  produto text not null default '',
  grupo text check (
    grupo in (
      'paes', 'bolos', 'salgados', 'doces', 'bebidas', 'laticinios', 'frios',
      'materia_prima', 'embalagens', 'limpeza', 'utensilios', 'funcionarios',
      'servicos', 'outros'
    )
  ),
  val_unit numeric(14, 2) not null default 0,
  desconto_val numeric(14, 2) not null default 0,
  desconto_pct numeric(5, 2) not null default 0 check (desconto_pct >= 0 and desconto_pct <= 100),
  total numeric(14, 2) not null default 0
);

create index discriminacoes_fechamento_id_idx on public.discriminacoes (fechamento_id, ordem);

-- ─── CREDIÁRIO (clientes/colaboradores, seção 4) ────────────────────────────
create table public.crediario_itens (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.fechamentos (id) on delete cascade,
  ordem integer not null default 0,
  tipo text not null check (tipo in ('cliente', 'colaborador')),
  nome text not null default '',
  valor numeric(14, 2) not null default 0,
  foto_path text -- Storage; foto do cupom assinado, hoje campo morto
);

create index crediario_itens_fechamento_id_idx on public.crediario_itens (fechamento_id, ordem);

-- ─── Trigger utilitária: atualizado_em ──────────────────────────────────────
create function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger fechamentos_set_atualizado_em
  before update on public.fechamentos
  for each row
  execute function public.set_atualizado_em();
