import { ref } from 'vue';

export interface VendaCancelada {
  produto: string;
  quantidade: number;
  valorCents: number;
  horario: string | null;
}

/**
 * Vendas/produtos cancelados — CENÁRIO (pedido do usuário, 23/09/2026): o robô de vendas
 * (CREARE/Compliart) hoje só envia vendas com STATUS='F' (finalizada) — ver
 * integracoes-scripts/queries/FECHAMENTO_CAIXA.sql — então não existe fonte de dados real pra
 * vendas canceladas ainda. `buscarPorData` sempre devolve uma lista vazia com `disponivel: false`
 * até o robô ser adaptado (o usuário avisa quando estiver pronto); quando isso acontecer, troca-se
 * só a implementação aqui por uma leitura real (mesmo padrão de useVendasProdutoDia.ts), sem
 * precisar mudar nenhum componente que já consome este composable.
 */
export function useVendasCanceladas() {
  const carregando = ref(false);
  const itens = ref<VendaCancelada[]>([]);
  const disponivel = ref(false);

  async function buscarPorData(_data: string): Promise<void> {
    carregando.value = true;
    try {
      itens.value = [];
      disponivel.value = false;
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, itens, disponivel, buscarPorData };
}
