import { ref } from 'vue';
import { buscarVendasCrearePorStatus } from './useVendasCreare';

/**
 * Compatível por estrutura com `VendaProdutoDia` (mesmos campos, mesmos nomes) — quem já espera
 * `VendaProdutoDia` (gerarPdfFechamento.ts, gerarPdfVendasCanceladas.ts,
 * whatsappVendasCanceladas.ts) continua funcionando sem mudar nada, só ganha `pdv` a mais.
 */
export interface VendaCancelada {
  id: string;
  vendaCreareId: string | null;
  produtoCodigo: string | null;
  produto: string;
  quantidade: number;
  valorUnitarioCents: number;
  totalCents: number;
  horaVenda: string | null;
  formaPagamento?: string | null;
  /** Novo (fluxo oficial CREARE, 25/09/2026) — de onde a venda cancelada veio. */
  pdv: string | null;
}

/**
 * Produtos cancelados do dia (pedido do usuário, 25/09/2026 — fluxo oficial CREARE -> robô ->
 * API): lê `vendas`/`vendas_itens`/`vendas_pagamentos` (`status='CANCELADA'`), uma venda pode ter
 * vários itens — cada item vira uma linha aqui (mesma granularidade que a tela já mostrava),
 * carregando o ID real da venda (`CREARE:<id>`), o PDV de origem e as formas de pagamento da
 * venda inteira. Sem venda alguma nesse dia com o robô ainda não instalado na loja — é esperado
 * ficar vazio até lá (ver diagnóstico compartilhado com o usuário).
 */
export function useVendasCanceladas() {
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const itens = ref<VendaCancelada[]>([]);

  async function buscarPorData(data: string): Promise<void> {
    carregando.value = true;
    erro.value = null;
    try {
      const vendas = await buscarVendasCrearePorStatus(data, 'CANCELADA');
      itens.value = vendas.flatMap((venda) => {
        const formaPagamento =
          venda.pagamentos.length > 0
            ? venda.pagamentos.map((p) => p.formaPagamento).join(', ')
            : null;
        return venda.itens.map((item) => ({
          id: item.id,
          vendaCreareId: venda.idCreare,
          produtoCodigo: item.produtoCodigo,
          produto: item.produto,
          quantidade: item.quantidade,
          valorUnitarioCents: item.valorUnitarioCents,
          totalCents: item.totalCents,
          horaVenda: venda.horaVenda,
          formaPagamento,
          pdv: venda.pdv,
        }));
      });
    } catch (e) {
      erro.value = e instanceof Error ? e.message : 'Não foi possível buscar os produtos cancelados.';
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, itens, buscarPorData };
}
