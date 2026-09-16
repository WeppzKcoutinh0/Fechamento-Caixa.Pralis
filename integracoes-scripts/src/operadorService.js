// Portado de services/operadorService.js do bot_padaria_v3 — só a parte pura (interpretarOperador),
// sem a resolução de COLABORADOR via planilha (DE_PARA_OPERADORES), que não existe aqui.
//
// O ERP não entrega a pessoa. O campo OPERADOR é o login do POSTO:
//   'VND CAIXA PDV - 1M'   posto   -> caixa 1, turno M (manhã)
//   'VND CAIXA PDV - 3T'   posto   -> caixa 3, turno T (tarde)
// CAIXA e TURNO saem de graça do próprio texto, sem cadastro nenhum.
import { text } from './hashService.js';

const RE_POSTO = /^VND\s+CAIXA\s+PDV\s*-\s*(\d+)\s*([MT])$/i;

export function interpretarOperador(operador) {
  const nome = text(operador).trim();
  const m = nome.match(RE_POSTO);
  if (m) return { natureza: 'posto', caixa: String(Number(m[1])), turno: m[2].toUpperCase() };
  return { natureza: 'nominal', caixa: '', turno: '' };
}
