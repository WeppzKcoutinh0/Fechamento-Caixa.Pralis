// Provisiona as contas reais do "Fluxo de Caixa" (pedido do usuário, 18/09/2026 — ver TASKS.md).
// Cria as 8 contas operacionais (Caixa 1-4 × Manhã/Tarde) via Supabase Auth Admin API + o profile
// de cada uma (role='caixa', caixa_padrao/turno_padrao travados), e garante o profile
// role='admin' pra rodrigo@cicluz.com.br (única conta real já existente).
//
// Roda uma vez só, manualmente: `node scripts/provisionar-contas-caixa.mjs`. Idempotente — pode
// rodar de novo sem duplicar (usa a conta/profile existente se já houver).
//
// Sem senha nenhuma no código-fonte (pedido explícito do usuário) — lidas de env var na hora de
// rodar:
//   SUPABASE_URL=https://<projeto>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...
//   CX_SENHA_MANHA=...   (senha inicial compartilhada das 4 contas de manhã)
//   CX_SENHA_TARDE=...   (senha inicial compartilhada das 4 contas de tarde)
//
// Este arquivo em si não contém nenhum segredo e pode ir pro git — só os valores das env vars na
// hora de executar ficam de fora.

const SUPABASE_URL = obterObrigatoria('SUPABASE_URL');
const SERVICE_KEY = obterObrigatoria('SUPABASE_SERVICE_ROLE_KEY');
const SENHA_MANHA = obterObrigatoria('CX_SENHA_MANHA');
const SENHA_TARDE = obterObrigatoria('CX_SENHA_TARDE');

const ADMIN_EMAIL = 'rodrigo@cicluz.com.br';

const CONTAS_CAIXA = [1, 2, 3, 4].flatMap((numero) => [
  {
    email: `caixa${numero}.manha@fechamentocaixa.local`,
    senha: SENHA_MANHA,
    nome: `Caixa ${numero} Manhã`,
    caixaPadrao: `Caixa ${numero}`,
    turnoPadrao: 'Manhã',
  },
  {
    email: `caixa${numero}.tarde@fechamentocaixa.local`,
    senha: SENHA_TARDE,
    nome: `Caixa ${numero} Tarde`,
    caixaPadrao: `Caixa ${numero}`,
    turnoPadrao: 'Tarde',
  },
]);

function obterObrigatoria(nome) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`Variável de ambiente obrigatória não informada: ${nome}`);
  return valor;
}

function headersAuth() {
  return {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    'content-type': 'application/json',
  };
}

async function encontrarUsuarioPorEmail(email) {
  const resposta = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`,
    { headers: headersAuth() },
  );
  if (!resposta.ok) throw new Error(`Falha ao listar usuários: HTTP ${resposta.status}`);
  const dados = await resposta.json();
  const usuarios = dados.users ?? dados;
  return usuarios.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function criarUsuario(email, senha) {
  const resposta = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headersAuth(),
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Falha ao criar ${email}: HTTP ${resposta.status} ${corpo.slice(0, 300)}`);
  }
  return resposta.json();
}

async function upsertProfile(userId, dados) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...headersAuth(), prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, ...dados }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Falha ao gravar profile de ${userId}: HTTP ${resposta.status} ${corpo.slice(0, 300)}`);
  }
}

async function principal() {
  for (const conta of CONTAS_CAIXA) {
    let usuario = await encontrarUsuarioPorEmail(conta.email);
    if (usuario) {
      console.log(`[ok] ${conta.email} já existe (id ${usuario.id}) — só garantindo o profile.`);
    } else {
      usuario = await criarUsuario(conta.email, conta.senha);
      console.log(`[criado] ${conta.email} (id ${usuario.id})`);
    }
    await upsertProfile(usuario.id, {
      role: 'caixa',
      nome: conta.nome,
      caixa_padrao: conta.caixaPadrao,
      turno_padrao: conta.turnoPadrao,
    });
    console.log(`  -> profile: role=caixa, caixa_padrao=${conta.caixaPadrao}, turno_padrao=${conta.turnoPadrao}`);
  }

  const admin = await encontrarUsuarioPorEmail(ADMIN_EMAIL);
  if (!admin) throw new Error(`Conta admin ${ADMIN_EMAIL} não encontrada — esperava que já existisse.`);
  await upsertProfile(admin.id, { role: 'admin', nome: 'Rodrigo' });
  console.log(`[ok] ${ADMIN_EMAIL} (id ${admin.id}) -> profile: role=admin`);

  console.log('\nProvisionamento concluído.');
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
