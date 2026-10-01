-- Bug real confirmado em produção (01/10/2026): 4 caixas fecharam hoje e o retorno automático
-- pro Cofre Fluxo não aconteceu pra NENHUMA delas, sem erro nenhum aparecer pro operador.
--
-- Causa raiz: `transferencias_tesouraria.lacre` tem um ÍNDICE ÚNICO global
-- (transferencias_tesouraria_lacre_idx). O retorno automático usava
-- `coalesce(nullif(trim(p_lacre), ''), 'RETORNO-' || p_fechamento_id)` — ou seja, quando o
-- operador digitava um lacre de fechamento (campo "N° Lacre final" da Transferência Final), o
-- retorno usava ESSE MESMO número como lacre da transferência. Só que hoje de manhã o admin já
-- tinha criado 4 transferências "Fluxo → Caixa X" usando os MESMOS números de lacre (prática real:
-- o operador reusa o número do malote físico na volta). O INSERT do retorno colidia com esse
-- lacre já existente, e `on conflict (lacre) do nothing` — pensado pra evitar duplicar o retorno
-- de um MESMO fechamento reenviado — engolia o insert em silêncio: nenhuma linha nova, nenhum
-- erro, o fechamento seguia normal como se tivesse dado certo.
--
-- Correção: o lacre do retorno automático passa a ser SEMPRE 'RETORNO-' || fechamento_id (nunca
-- mais o lacre físico digitado pelo operador) — garante unicidade de verdade (um fechamento só
-- tem um ID) sem nunca colidir com nenhum lacre físico real. O lacre físico informado continua
-- registrado, só que na observação, pra quem for conferir depois.
create or replace function public.criar_retorno_automatico_tesouraria(
  p_fechamento_id uuid,
  p_caixa text,
  p_codigo text,
  p_valor numeric,
  p_valor_notas numeric default null,
  p_valor_moedas numeric default null,
  p_lacre text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_fechamento public.fechamentos%rowtype;
  v_total_contado numeric;
  v_notas numeric;
  v_moedas numeric;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sessão obrigatória.';
  end if;

  select f.* into v_fechamento
    from public.fechamentos f
   where f.id = p_fechamento_id;

  if not found then
    raise exception using errcode = '22023', message = 'Fechamento não encontrado.';
  end if;

  if not public.is_admin() and v_fechamento.criado_por is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Fechamento não pertence ao usuário.';
  end if;

  v_notas := coalesce(v_fechamento.dinheiro_contado_notas, p_valor_notas, 0);
  v_moedas := coalesce(v_fechamento.dinheiro_contado_moedas, p_valor_moedas, 0);
  v_total_contado := v_notas + v_moedas;

  -- Compatibilidade com fechamentos antigos sem notas/moedas persistidas.
  if v_fechamento.dinheiro_contado_notas is null
     and v_fechamento.dinheiro_contado_moedas is null then
    v_total_contado := v_fechamento.dinheiro_contado;
  end if;

  if p_caixa is distinct from v_fechamento.caixa
     or p_codigo is distinct from v_fechamento.codigo
     or p_valor is distinct from v_total_contado
     or p_valor <= 0 then
    raise exception using errcode = '22023', message = 'Dados do retorno não correspondem ao fechamento.';
  end if;

  insert into public.transferencias_tesouraria (
    valor, valor_notas, valor_moedas, lacre, data_lanc, caixa_origem, caixa_destino,
    tempo_confirmacao, observacao, criado_por
  ) values (
    v_total_contado,
    v_notas,
    v_moedas,
    'RETORNO-' || p_fechamento_id::text,
    v_fechamento.data,
    v_fechamento.caixa,
    'Fluxo',
    true,
    'Retorno automático do fechamento ' || v_fechamento.codigo
      || case when nullif(trim(p_lacre), '') is not null
           then ' (lacre físico: ' || trim(p_lacre) || ')'
           else ''
         end,
    auth.uid()
  )
  on conflict (lacre) do nothing;
end;
$$;

revoke all on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric, numeric, numeric, text) to authenticated;
