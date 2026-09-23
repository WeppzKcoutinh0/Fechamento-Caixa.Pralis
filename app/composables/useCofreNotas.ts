import { useSupabase } from './useSupabase';
import type { CofreCentral } from './useTransferenciasTesouraria';

export interface CofreNota {
  id: string;
  cofre: CofreCentral;
  texto: string;
  criadoPorNome: string;
  criadoEm: string;
}

interface NotaRow {
  id: string;
  cofre: CofreCentral;
  texto: string;
  criado_por: string;
  criado_em: string;
}

/**
 * Anotações livres por cofre central (pedido do usuário, 23/09/2026): "clica e expande e anota" —
 * observação sem efeito financeiro (ver migration 20260923110000), nunca vira transação.
 */
export function useCofreNotas() {
  const supabase = useSupabase();

  // `cofre_notas.criado_por` referencia `auth.users`, não `profiles` diretamente — sem FK entre
  // as duas tabelas o PostgREST não consegue embedar `profiles(nome)` no select, então busca os
  // nomes à parte e junta no client (mesmo padrão de historico.vue/pendencias.vue).
  async function listar(cofre: CofreCentral): Promise<CofreNota[]> {
    const { data, error } = await supabase
      .from('cofre_notas')
      .select('id, cofre, texto, criado_por, criado_em')
      .eq('cofre', cofre)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    const linhas = data as unknown as NotaRow[];

    const idsUsuarios = [...new Set(linhas.map((n) => n.criado_por))];
    const { data: perfis } = idsUsuarios.length
      ? await supabase.from('profiles').select('user_id, nome').in('user_id', idsUsuarios)
      : { data: [] as { user_id: string; nome: string }[] };
    const nomePorUsuario = new Map((perfis ?? []).map((p) => [p.user_id, p.nome]));

    return linhas.map((n) => ({
      id: n.id,
      cofre: n.cofre,
      texto: n.texto,
      criadoPorNome: nomePorUsuario.get(n.criado_por) ?? '—',
      criadoEm: n.criado_em,
    }));
  }

  async function adicionar(cofre: CofreCentral, texto: string): Promise<void> {
    const { error } = await supabase.from('cofre_notas').insert({ cofre, texto: texto.trim() });
    if (error) throw error;
  }

  async function remover(id: string): Promise<void> {
    const { error } = await supabase.from('cofre_notas').delete().eq('id', id);
    if (error) throw error;
  }

  return { listar, adicionar, remover };
}
