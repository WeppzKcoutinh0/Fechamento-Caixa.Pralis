/**
 * Consulta de entradas/transferências/saídas por período — cálculo puro (mesma convenção de
 * `utils/vendas.ts`/`utils/painel.ts`). Filtra pelo horário REAL que existe (`criado_em` do
 * fechamento, quando ele foi salvo) — não existe horário individual por entrada/sangria/
 * transferência/lançamento no banco, então não inventamos um.
 *
 * Correção real (18/09/2026, reportado pelo usuário): a aba "Transferências" nunca mostrou uma
 * transferência de verdade — desde o primeiro commit do projeto, `extrairLinhas('transferencias')`
 * juntava `entradas` + `sangrias` (negadas), e a tabela real de transferências entre caixas
 * (`transferencias_caixa`) nunca era lida em lugar nenhum desta consulta. "Saídas" também não
 * incluía `sangrias` (só `lancamentos`). Cada aba passa a mostrar exatamente a tabela que o nome
 * diz: Entradas -> `entradas`; Transferências -> `transferencias_caixa`; Saídas -> `sangrias` +
 * `lancamentos` (as duas são retirada de dinheiro do caixa).
 */

export interface JanelaDatetime {
  inicioISO: string;
  fimISO: string;
}

/** "2026-09-15" + "08:00"/"18:00" -> janela [início, fim] em ISO, no fuso do navegador. */
export function calcularJanelaDatetime(data: string, horarioDe: string, horarioAte: string): JanelaDatetime {
  return {
    inicioISO: new Date(`${data}T${horarioDe || '00:00'}:00`).toISOString(),
    fimISO: new Date(`${data}T${horarioAte || '23:59'}:59`).toISOString(),
  };
}

export type TipoConsulta = 'entradas' | 'transferencias' | 'saidas';

export interface FechamentoComItens {
  id: string;
  codigo: string;
  caixa: string;
  turno: string;
  criadoEm: string;
  entradas: { descricao: string; lacre: string; valorCents: number }[];
  sangrias: { descricao: string; lacre: string; valorCents: number }[];
  lancamentos: { tipo: string; fornecedor: string; valorCents: number }[];
  transferenciasCaixa: { caixaOrigem: string; caixaDestino: string; lacre: string; observacao: string; valorCents: number }[];
}

export interface LinhaConsulta {
  fechamentoId: string;
  fechamentoCodigo: string;
  caixa: string;
  turno: string;
  criadoEm: string;
  descricao: string;
  detalhe: string;
  valorCents: number;
}

const ROTULO_TIPO_LANCAMENTO: Record<string, string> = {
  despesa: 'Despesa',
  mercadoria: 'Mercadoria',
  retirada: 'Retirada',
};

/** Achata os fechamentos filtrados nas linhas de exibição, conforme o tipo de consulta pedido. */
export function extrairLinhas(fechamentos: FechamentoComItens[], tipo: TipoConsulta): LinhaConsulta[] {
  const linhas: LinhaConsulta[] = [];

  for (const f of fechamentos) {
    const base = { fechamentoId: f.id, fechamentoCodigo: f.codigo, caixa: f.caixa, turno: f.turno, criadoEm: f.criadoEm };

    if (tipo === 'entradas') {
      for (const e of f.entradas) {
        linhas.push({ ...base, descricao: e.descricao || 'Entrada', detalhe: e.lacre ? `Lacre ${e.lacre}` : '', valorCents: e.valorCents });
      }
    }
    if (tipo === 'transferencias') {
      for (const t of f.transferenciasCaixa) {
        linhas.push({
          ...base,
          descricao: t.observacao || 'Transferência entre caixas',
          detalhe: [`${t.caixaOrigem || '?'} → ${t.caixaDestino || '?'}`, t.lacre ? `Lacre ${t.lacre}` : ''].filter(Boolean).join(' · '),
          valorCents: t.valorCents,
        });
      }
    }
    if (tipo === 'saidas') {
      for (const s of f.sangrias) {
        linhas.push({ ...base, descricao: s.descricao || 'Sangria', detalhe: s.lacre ? `Lacre ${s.lacre}` : '', valorCents: s.valorCents });
      }
      for (const l of f.lancamentos) {
        linhas.push({
          ...base,
          descricao: l.fornecedor || ROTULO_TIPO_LANCAMENTO[l.tipo] || l.tipo,
          detalhe: ROTULO_TIPO_LANCAMENTO[l.tipo] ?? l.tipo,
          valorCents: l.valorCents,
        });
      }
    }
  }

  return linhas.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export function somarValores(linhas: LinhaConsulta[]): number {
  return linhas.reduce((total, l) => total + l.valorCents, 0);
}
