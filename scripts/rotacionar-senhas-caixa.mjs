// Troca a senha das 8 contas de caixa de "compartilhada por turno" pra uma senha ÚNICA por
// conta (pedido do usuário, 18/09/2026 — ver TASKS.md, achado do `security-reviewer`: senha
// compartilhada dissolve o isolamento entre operadores do mesmo turno).
//
// Roda uma vez, manualmente: `node scripts/rotacionar-senhas-caixa.mjs`. Não sobrescreve nada
// além da senha (perfil/role/caixa_padrao/turno_padrao ficam intocados). As senhas geradas só
// aparecem no stdout desta execução — nunca são escritas em arquivo nem ficam no código-fonte.
//
// Requer:
//   SUPABASE_URL=https://<projeto>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...

import crypto from 'node:crypto';

const SUPABASE_URL = obterObrigatoria('SUPABASE_URL');
const SERVICE_KEY = obterObrigatoria('SUPABASE_SERVICE_ROLE_KEY');

const EMAILS_CAIXA = [1, 2, 3, 4].flatMap((numero) => [
  `caixa${numero}.manha@fechamentocaixa.local`,
  `caixa${numero}.tarde@fechamentocaixa.local`,
]);

function obterObrigatoria(nome) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`Variável de ambiente obrigatória não informada: ${nome}`);
  return valor;
}

function headersAuth() {
  return { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' };
}

// Sem caracteres ambíguos (0/O, 1/l/I) — vai ser digitado num terminal de caixa.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function gerarSenha() {
  const base = Array.from({ length: 10 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');
  const simbolo = '!@#$%&*'[crypto.randomInt(7)];
  return `${base}${simbolo}`;
}

async function encontrarUsuarioPorEmail(email) {
  const resposta = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, { headers: headersAuth() });
  if (!resposta.ok) throw new Error(`Falha ao listar usuários: HTTP ${resposta.status}`);
  const dados = await resposta.json();
  const usuarios = dados.users ?? dados;
  return usuarios.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function trocarSenha(userId, novaSenha) {
  const resposta = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: headersAuth(),
    body: JSON.stringify({ password: novaSenha }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Falha ao trocar senha de ${userId}: HTTP ${resposta.status} ${corpo.slice(0, 300)}`);
  }
}

async function confirmarLogin(email, senha) {
  const resposta = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  return resposta.ok;
}

async function principal() {
  const resultado = [];
  for (const email of EMAILS_CAIXA) {
    const usuario = await encontrarUsuarioPorEmail(email);
    if (!usuario) {
      console.error(`[erro] ${email} não encontrado — pulando.`);
      continue;
    }
    const novaSenha = gerarSenha();
    await trocarSenha(usuario.id, novaSenha);
    const loginOk = await confirmarLogin(email, novaSenha);
    resultado.push({ email, novaSenha, loginOk });
  }

  console.log('\n=== Novas senhas (cada conta agora é única — guarde num lugar seguro) ===');
  for (const r of resultado) {
    console.log(`${r.email.padEnd(32)} ${r.novaSenha}  ${r.loginOk ? '(login confirmado)' : '(FALHA AO CONFIRMAR LOGIN)'}`);
  }
  const falhas = resultado.filter((r) => !r.loginOk);
  if (falhas.length) {
    console.error(`\n${falhas.length} conta(s) com falha na confirmação — verificar manualmente.`);
    process.exitCode = 1;
  }
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
