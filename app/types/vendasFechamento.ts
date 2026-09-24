/**
 * Contrato REAL do `bot_padaria_v3` (ver `integracoes-scripts/` e `services/pralisSalesService.js`
 * do bot): `POST /vendas/importar`, `Authorization: Bearer <token>`,
 * `{ tipo, linhas: [...] }`. As chaves de cada linha são MAIÚSCULAS de propósito — são as mesmas
 * que o bot grava na planilha Google Sheets (`config.yaml` → `ABAS`), reaproveitadas aqui sem
 * tradução para não divergir do que já está testado e rodando em produção.
 *
 * Os campos numéricos/data aceitam string ou number soltos (validação de ESTRUTURA só) — o
 * parsing de verdade (vírgula decimal, "DD/MM/YYYY", prefixo de aspa do Sheets) é feito por
 * `server/utils/parseValoresBot.ts`, não aqui.
 */
import { z } from 'zod';

const valorLivre = z.union([z.string(), z.number()]).nullish();
const textoObrigatorio = z.string().trim().min(1);

export const linhaFechamentoCaixaDiaSchema = z.object({
  DATA_VENDA: textoObrigatorio,
  PDV: textoObrigatorio,
  OPERADOR: textoObrigatorio,
  // Hora cheia da venda (0-23) — ver FECHAMENTO_CAIXA.sql v6. Ausente/null = linha antiga sem
  // esse detalhe (representa o turno inteiro, não uma hora).
  HORA: valorLivre,
  PRIMEIRA_VENDA: valorLivre,
  ULTIMA_VENDA: valorLivre,
  NUMERO_VENDAS: valorLivre,
  CREDIARIO: valorLivre,
  CREDITO: valorLivre,
  DEBITO: valorLivre,
  DINHEIRO: valorLivre,
  PIX: valorLivre,
  VOUCHER: valorLivre,
  OUTROS: valorLivre,
  TOTAL_PAGAMENTO: valorLivre,
  CLIENTES: valorLivre,
  COLABORADORES: valorLivre,
  ALIMENTACAO: valorLivre,
  ROUBO_FURTO: valorLivre,
  SOCIOS: valorLivre,
  SOBRA_PERDA: valorLivre,
  EMPRESA: textoObrigatorio,
  ATUALIZADO_EM: valorLivre,
  CHAVE: valorLivre,
  CAIXA: valorLivre,
  TURNO: valorLivre,
  COLABORADOR: valorLivre,
  HASH: textoObrigatorio,
});

export const linhaVendaProdutoDiaSchema = z.object({
  DATA_VENDA: textoObrigatorio,
  PRODUTO_CODIGO: valorLivre,
  PRODUTO: textoObrigatorio,
  QUANTIDADE: valorLivre,
  VALOR_UNITARIO: valorLivre,
  TOTAL: valorLivre,
  // 'F' (finalizada) ou 'C' (cancelada) — pedido do usuário, 24/09/2026, ver
  // integracoes-scripts/queries/VENDAS_PRODUTOS.sql. Ausente = planilha antiga sem essa coluna
  // ainda (bot_padaria_v3 em produção não manda por enquanto) — trata como finalizada, mesmo
  // comportamento de sempre.
  TIPO: valorLivre,
  // Horário da transação (pedido do usuário, 24/09/2026) — só vem preenchido pra itens cancelados,
  // derivado de VENDAS_TIPOS!DATA_VENDA_BALCAO (ver agregarVendasCanceladas.ts). Ausente pra vendas
  // normais (VENDAS_PRODUTOS não tem hora, só o dia todo já somado).
  HORA_VENDA: valorLivre,
  EMPRESA: textoObrigatorio,
  ATUALIZADO_EM: valorLivre,
  HASH: textoObrigatorio,
});

export const importarVendasPayloadSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('fechamento_caixa_dia'),
    linhas: z.array(linhaFechamentoCaixaDiaSchema).max(500),
  }),
  z.object({
    tipo: z.literal('venda_produto_dia'),
    linhas: z.array(linhaVendaProdutoDiaSchema).max(500),
  }),
]);

export type LinhaFechamentoCaixaDia = z.infer<typeof linhaFechamentoCaixaDiaSchema>;
export type LinhaVendaProdutoDia = z.infer<typeof linhaVendaProdutoDiaSchema>;
export type ImportarVendasPayload = z.infer<typeof importarVendasPayloadSchema>;

// ─── Leitura no frontend (dados já sincronizados no Supabase) ──────────────────────────────────

export interface FechamentoCaixaDiaRegistro {
  id: string;
  empresa: string;
  dataVenda: string;
  pdv: string;
  operador: string;
  caixa: string | null;
  turno: string | null;
  hora: number | null;
  numeroVendas: number;
  crediario: number;
  credito: number;
  debito: number;
  dinheiro: number;
  pix: number;
  voucher: number;
  outros: number;
  totalPagamento: number;
  clientes: number;
}

/** Resumo de um dia, usado pelo botão "Buscar vendas" na Identificação. */
export interface ResumoVendasDia {
  data: string;
  registros: number;
  numeroVendas: number;
  totalPagamento: number;
  porForma: {
    dinheiro: number;
    credito: number;
    debito: number;
    pix: number;
    voucher: number;
    /** CLIENTES (crediário) — CREDIARIO sai sempre zerado nas vendas novas, ver query do bot. */
    crediario: number;
    outros: number;
  };
  /**
   * Colaboradores/Alimentação/Furto-Roubo/Sócios/Sobra-Perda — o CREARE já manda esses valores
   * (colunas próprias em `vendas_fechamento_caixa_dia`, sempre existiram), mas até agora nenhuma
   * tela mostrava — ficavam sincronizados e esquecidos. Puramente informativo: NENHUM desses
   * campos entra em `calculateRelatorioFinal`/`totalPagamento`/`porForma` — só ficam visíveis pra
   * o responsável decidir se vale lançar como despesa/mercadoria manualmente (ver
   * SecaoIdentificacao.vue/SecaoRelatorios.vue).
   */
  ajustes: {
    colaboradores: number;
    alimentacao: number;
    rouboFurto: number;
    socios: number;
    sobraPerda: number;
  };
}
