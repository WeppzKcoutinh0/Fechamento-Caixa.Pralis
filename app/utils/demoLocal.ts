import type { Caixa, FechamentoDraft, Turno } from '~/types/fechamento';
import type { ResumoVendasDia } from '~/types/vendasFechamento';

export const DEMO_DATA = '2026-10-05';
export const DEMO_SESSION_ID = 'demo-sessao-caixa1-manha-20261005';
export const DEMO_LACRE_ABERTURA = 'DEMO-0510';
export const DEMO_LACRE_TRANSFERENCIA = 'DEMO-0510';

export interface DemoVendaProduto {
  id: string;
  vendaCreareId: string;
  formaPagamento: string;
  produto: string;
  produtoCodigo: string;
  quantidade: number;
  valorUnitarioCents: number;
  totalCents: number;
  horaVenda: string | null;
}

export interface DemoVendaCancelada extends DemoVendaProduto {
  horaVenda: string;
  pdv: string;
}

export function modoDemoLocal(): boolean {
  return useRuntimeConfig().public.demoLocal === true;
}

export function demoResumoVendas(): ResumoVendasDia {
  return {
    data: DEMO_DATA,
    registros: 1,
    numeroVendas: 12,
    totalPagamento: 1050,
    porForma: {
      dinheiro: 320,
      credito: 300,
      debito: 250,
      pix: 150,
      voucher: 30,
      crediario: 0,
      outros: 0,
    },
    ajustes: {
      colaboradores: 0,
      alimentacao: 0,
      rouboFurto: 0,
      socios: 0,
      sobraPerda: 0,
    },
  };
}

export function demoProdutosVendidos(): DemoVendaProduto[] {
  return [
    {
      id: 'demo-produto-1',
      vendaCreareId: 'DEMO-VENDA-1001',
      formaPagamento: 'Dinheiro',
      produto: 'Café especial 300ml',
      produtoCodigo: 'CAF-300',
      quantidade: 10,
      valorUnitarioCents: 800,
      totalCents: 8000,
      horaVenda: null,
    },
    {
      id: 'demo-produto-2',
      vendaCreareId: 'DEMO-VENDA-1002',
      formaPagamento: 'Crédito',
      produto: 'Sanduíche artesanal',
      produtoCodigo: 'SAN-001',
      quantidade: 10,
      valorUnitarioCents: 3000,
      totalCents: 30000,
      horaVenda: null,
    },
    {
      id: 'demo-produto-3',
      vendaCreareId: 'DEMO-VENDA-1003',
      formaPagamento: 'Pix',
      produto: 'Pizza brotinho',
      produtoCodigo: 'PIZ-001',
      quantidade: 8,
      valorUnitarioCents: 2500,
      totalCents: 20000,
      horaVenda: null,
    },
    {
      id: 'demo-produto-4',
      vendaCreareId: 'DEMO-VENDA-1004',
      formaPagamento: 'Débito',
      produto: 'Bolo caseiro',
      produtoCodigo: 'BOL-001',
      quantidade: 10,
      valorUnitarioCents: 2700,
      totalCents: 27000,
      horaVenda: null,
    },
  ];
}

export function demoProdutosCancelados(): DemoVendaCancelada[] {
  return [
    {
      id: 'demo-cancelado-1',
      vendaCreareId: 'DEMO-CANCEL-2001',
      formaPagamento: 'Dinheiro',
      produto: 'Bebida láctea 200ml',
      produtoCodigo: 'BL-200',
      quantidade: 1,
      valorUnitarioCents: 300,
      totalCents: 300,
      horaVenda: '09:15:00',
      pdv: 'Caixa 1',
    },
    {
      id: 'demo-cancelado-2',
      vendaCreareId: 'DEMO-CANCEL-2002',
      formaPagamento: 'Crédito',
      produto: 'Pão de queijo grande',
      produtoCodigo: 'PDQ-001',
      quantidade: 2,
      valorUnitarioCents: 450,
      totalCents: 900,
      horaVenda: '10:40:00',
      pdv: 'Caixa 1',
    },
    {
      id: 'demo-cancelado-3',
      vendaCreareId: 'DEMO-CANCEL-2003',
      formaPagamento: 'Pix',
      produto: 'Suco natural 500ml',
      produtoCodigo: 'SUC-500',
      quantidade: 1,
      valorUnitarioCents: 700,
      totalCents: 700,
      horaVenda: '11:25:00',
      pdv: 'Caixa 1',
    },
  ];
}

export function demoTransferenciaAbertura() {
  return {
    id: 'demo-transferencia-0510',
    valorCents: 30000,
    valorNotasCents: 28000,
    valorMoedasCents: 2000,
    lacre: DEMO_LACRE_TRANSFERENCIA,
    dataLanc: DEMO_DATA,
    agendamento: false,
    dataRecebimento: DEMO_DATA,
    confirmadoEm: new Date().toISOString(),
    caixaOrigem: 'Caixa Principal' as const,
    caixaDestino: 'Caixa 1' as Caixa,
    turnoOrigem: null,
    turnoDestino: 'Manhã' as Turno,
    multiploDestino: false,
    destinosExtra: [],
    tempoConfirmacao: false,
    transferenciaRetorno: false,
    observacao: 'Transferência fictícia do modo demonstração local.',
    criadoEm: new Date().toISOString(),
    lacreUsadoEm: null,
  };
}

export function prepararDraftDemo(draft: FechamentoDraft): void {
  draft.data = DEMO_DATA;
  draft.caixa = 'Caixa 1';
  draft.turno = 'Manhã';
  draft.responsavel = 'Operador demonstração';
  draft.nrMaquininha = 'DEMO-MAQ-01';
  draft.pdvEntradas = [
    {
      id: 'demo-pdv-1',
      nrClientes: 12,
      dinheiroCents: 32000,
      creditoCents: 30000,
      debitoCents: 25000,
      pixCents: 15000,
      voucherCents: 3000,
      crediarioCents: 0,
    },
  ];
  draft.creditoManhaCents = 30000;
  draft.debitoManhaCents = 25000;
  draft.pixManhaCents = 15000;
  draft.voucherManhaCents = 3000;
  draft.lacreAbertura = DEMO_LACRE_ABERTURA;
}
