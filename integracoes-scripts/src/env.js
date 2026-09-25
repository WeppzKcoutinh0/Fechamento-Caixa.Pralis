function obterObrigatoria(nome) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`Variavel de ambiente obrigatoria nao informada: ${nome}`);
  return valor;
}

function obterNumero(nome, padrao) {
  const valor = process.env[nome]?.trim();
  if (!valor) return padrao;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error(`Variavel de ambiente invalida: ${nome}`);
  return numero;
}

function obterBooleano(nome, padrao) {
  const valor = process.env[nome]?.trim().toLowerCase();
  if (!valor) return padrao;
  return valor === 'true' || valor === '1';
}

export function obterConfig() {
  return {
    creare: {
      host: obterObrigatoria('SERVIDOR_CREARE_COMPILART'),
      port: obterNumero('PORTA_CREARE_COMPILART', 3306),
      database: obterObrigatoria('BANCO_CREARE_COMPILART'),
      user: obterObrigatoria('USUARIO_CREARE_COMPILART'),
      password: process.env.SENHA_CREARE_COMPILART ?? '',
    },
    empresa: obterObrigatoria('EMPRESA'),
    pralis: {
      apiUrl: (process.env.PRALIS_VENDAS_API_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, ''),
      token: obterObrigatoria('PRALIS_VENDAS_API_TOKEN'),
    },
    sincronizacao: {
      intervaloMinutos: obterNumero('SYNC_INTERVALO_MINUTOS', 10),
      diasReprocessar: obterNumero('SYNC_DIAS_REPROCESSAR', 3),
      lockMaxMinutos: obterNumero('SYNC_LOCK_MAX_MINUTOS', 30),
      retryTentativas: obterNumero('SYNC_RETRY_TENTATIVAS', 4),
      retryBaseMs: obterNumero('SYNC_RETRY_BASE_MS', 500),
      enviarProdutos: obterBooleano('SYNC_ENVIAR_PRODUTOS', true),
      // Fluxo oficial CREARE -> robô -> API (25/09/2026): vendas por venda (não agregado),
      // fonte de verdade de "Vendas canceladas" — ligado por padrão.
      enviarVendas: obterBooleano('SYNC_ENVIAR_VENDAS', true),
      estadoDir: process.env.SYNC_ESTADO_DIR?.trim() || '.estado',
    },
  };
}
