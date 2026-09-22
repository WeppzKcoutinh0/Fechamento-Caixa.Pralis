import { exigirUsuarioAutenticado } from '../../utils/usuarioAutenticado';
import {
  centavosPlausiveis,
  chamarProvedorIa,
  listaAvisos,
  numeroOuNulo,
  textoOuNulo,
  validarImagemRecebida,
} from '../../utils/leituraIa';

interface CorpoRequisicao {
  mimeType?: string;
  imageBase64?: string;
}

interface ItemModelo {
  produto?: unknown;
  qtd?: unknown;
  valorUnitario?: unknown;
}

interface LeituraModelo {
  fornecedor?: unknown;
  itens?: unknown;
  confianca?: unknown;
  avisos?: unknown;
}

// Limite generoso pra uma nota de padaria — protege contra a IA "alucinar" uma lista enorme.
const MAX_ITENS = 60;
// Teto de sanidade por item (menor que o de campos de turno inteiro: um item isolado de nota
// de padaria acima disso é implausível).
const TETO_ITEM_CENTAVOS = 50_000_00; // R$ 50.000,00

function itensValidos(valor: unknown, avisosExtras: string[]): { produto: string; qtd: number; valUnitCents: number }[] {
  if (!Array.isArray(valor)) return [];
  const itens: { produto: string; qtd: number; valUnitCents: number }[] = [];
  for (const bruto of valor.slice(0, MAX_ITENS)) {
    if (!bruto || typeof bruto !== 'object') continue;
    const item = bruto as ItemModelo;
    const produto = textoOuNulo(item.produto);
    const valUnitCents = centavosPlausiveis(item.valorUnitario, `item "${produto ?? '?'}"`, avisosExtras, TETO_ITEM_CENTAVOS);
    if (!produto || valUnitCents === null) continue;
    const qtdBruta = numeroOuNulo(item.qtd);
    const qtd = qtdBruta === null || qtdBruta <= 0 ? 1 : qtdBruta;
    itens.push({ produto, qtd, valUnitCents });
  }
  if (Array.isArray(valor) && valor.length > MAX_ITENS) {
    avisosExtras.push(`A nota tinha mais de ${MAX_ITENS} itens — só os primeiros foram lidos, confira o restante manualmente.`);
  }
  return itens;
}

/**
 * Lê a foto de uma nota fiscal/boleto/cupom de despesa ou mercadoria e devolve a lista de itens
 * pra discriminação (qtd/produto/valor unitário) — nunca classifica o "grupo" de cada item (pedido
 * explícito do usuário: prefere revisar manualmente a arriscar uma classificação errada). Mesmo
 * espírito da leitura de maquininha: não grava nada, só devolve um patch revisável.
 */
export default defineEventHandler(async (event) => {
  await exigirUsuarioAutenticado(getHeader(event, 'authorization'));

  const corpo = await readBody<CorpoRequisicao>(event);
  validarImagemRecebida(corpo.mimeType, corpo.imageBase64);

  const modelo = await chamarProvedorIa<LeituraModelo>([
    {
      role: 'system',
      content:
        'Você é um extrator de notas fiscais, boletos e cupons de despesa/mercadoria de uma padaria no Brasil. Leia apenas o que estiver legível na imagem. Nunca invente um item, produto ou valor que não esteja na imagem — isso é uma regra crítica, não uma sugestão. Retorne JSON puro com as chaves: fornecedor (nome do emissor/fornecedor, ou null), itens (array de {produto, qtd, valorUnitario}), confianca (0 a 1) e avisos (array de strings).\n\nPara cada item: "produto" é o nome/descrição como aparece na nota (não traduza nem resuma); "qtd" é a quantidade (use 1 se a nota não mostrar quantidade explícita); "valorUnitario" é o valor unitário em reais, sem símbolo — se a nota só mostrar o valor total da linha (qtd × unitário), calcule o unitário dividindo o total pela quantidade; se não for possível determinar o valor com segurança, não inclua o item na lista e explique em avisos. NUNCA invente ou estime um valor unitário sem base clara na imagem. Ignore linhas de total geral/subtotal/impostos — só produtos/serviços individuais viram item. Não tente classificar categoria/grupo do produto — essa informação não existe no seu retorno.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Extraia o fornecedor e a lista de itens (produto, quantidade, valor unitário) desta nota/boleto/cupom. Se algum item tiver valor ilegível ou ambíguo, deixe-o de fora da lista e explique em avisos, em vez de adivinhar.',
        },
        {
          type: 'image_url',
          image_url: { url: `data:${corpo.mimeType};base64,${corpo.imageBase64}` },
        },
      ],
    },
  ]);

  const avisosExtras: string[] = [];
  const itens = itensValidos(modelo.itens, avisosExtras);
  const confianca = numeroOuNulo(modelo.confianca);

  return {
    fornecedor: textoOuNulo(modelo.fornecedor),
    itens,
    confianca: confianca === null ? null : Math.min(1, Math.max(0, confianca)),
    avisos: [...avisosExtras, ...listaAvisos(modelo.avisos)],
  };
});
