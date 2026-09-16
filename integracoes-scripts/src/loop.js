import { obterConfig } from './env.js';
import { adquirirLock, liberarLock } from './lockService.js';
import { derivarCaminhos, executarCiclo } from './sincronizar.js';

// Sono interrompível: dorme por ms, mas acorda na hora se interromper() for chamado (shutdown).
function criarSono() {
  let resolver = null;
  let timer = null;
  return {
    dormir(ms) {
      return new Promise((resolve) => {
        resolver = resolve;
        timer = setTimeout(() => {
          timer = null;
          resolver = null;
          resolve();
        }, ms);
      });
    },
    interromper() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (resolver) {
        const resolve = resolver;
        resolver = null;
        resolve();
      }
    },
  };
}

async function main() {
  const config = obterConfig();
  const sync = config.sincronizacao;
  const caminhos = derivarCaminhos(config);
  const maxIdadeMs = sync.lockMaxMinutos * 60_000;
  const intervaloMs = Math.max(1, sync.intervaloMinutos) * 60_000;

  try {
    await adquirirLock(caminhos.lockArquivo, { maxIdadeMs });
  } catch (erro) {
    console.log(`[agente] ${erro.message} Saindo.`);
    return;
  }

  let parar = false;
  const sono = criarSono();
  const encerrar = () => {
    parar = true;
    sono.interromper();
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);

  console.log(`[agente] iniciado (intervalo=${sync.intervaloMinutos}min, empresa=${config.empresa}). Sinal de parada encerra com seguranca.`);
  try {
    while (!parar) {
      try {
        await executarCiclo(config, caminhos);
      } catch (erro) {
        console.error(`[agente] ciclo falhou: ${erro instanceof Error ? erro.message : erro}`);
      }
      if (parar) break;
      await sono.dormir(intervaloMs);
    }
  } finally {
    await liberarLock(caminhos.lockArquivo);
    console.log('[agente] encerrado.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
