// Provisiona as contas reais do "Fluxo de Caixa" (pedido do usuário, 18/09/2026, credenciais
// simplificadas a pedido do usuário em 24/09/2026 — Caixa 5 novo, operado pelo gerente de manhã).
// Cria as 10 contas operacionais (Caixa 1-5 × Manhã/Tarde) via Supabase Auth Admin API + o profile
// de cada uma (role='caixa', caixa_padrao/turno_padrao travados), e garante o profile
// role='admin' pra rodrigo@cicluz.com.br (única conta real já existente, NUNCA mexida aqui).
//
// Roda uma vez só, manualmente: `node scripts/provisionar-contas-caixa.mjs`. Idempotente — pode
// rodar de novo sem duplicar (usa a conta/profile existente se já houver).
//
// Credenciais fixas de propósito (pedido explícito do usuário: simples e fáceis de repassar pra
// equipe, não segredos de alta entropia) — únicas variáveis de ambiente exigidas são as de acesso
// ao próprio Supabase:
//   SUPABASE_URL=https://<projeto>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...

const SUPABASE_URL = obterObrigatoria('SUPABASE_URL');
const SERVICE_KEY = obterObrigatoria('SUPABASE_SERVICE_ROLE_KEY');

const ADMIN_EMAIL = 'rodrigo@cicluz.com.br';

const CONTAS_CAIXA = [
  { email: 'caixa1mtnp@fechamentocaixa.local', senha: 'caixaM1@', nome: 'Caixa 1 - Manhã', caixaPadrao: 'Caixa 1', turnoPadrao: 'Manhã' },
  { email: 'caixa2mtnp@fechamentocaixa.local', senha: 'caixaM2@', nome: 'Caixa 2 - Manhã', caixaPadrao: 'Caixa 2', turnoPadrao: 'Manhã' },
  { email: 'caixa3mtnp@fechamentocaixa.local', senha: 'caixaM3@', nome: 'Caixa 3 - Manhã', caixaPadrao: 'Caixa 3', turnoPadrao: 'Manhã' },
  { email: 'caixa4mtnp@fechamentocaixa.local', senha: 'caixaM4@', nome: 'Caixa 4 - Manhã', caixaPadrao: 'Caixa 4', turnoPadrao: 'Manhã' },
  { email: 'caixa5gtnp@fechamentocaixa.local', senha: 'caixa5GM@', nome: 'Caixa 5 - Gerente (Manhã)', caixaPadrao: 'Caixa 5', turnoPadrao: 'Manhã' },
  { email: 'caixa1ttnp@fechamentocaixa.local', senha: 'caixaT1@', nome: 'Caixa 1 - Tarde', caixaPadrao: 'Caixa 1', turnoPadrao: 'Tarde' },
  { email: 'caixa2ttnp@fechamentocaixa.local', senha: 'caixaT2@', nome: 'Caixa 2 - Tarde', caixaPadrao: 'Caixa 2', turnoPadrao: 'Tarde' },
  { email: 'caixa3ttnp@fechamentocaixa.local', senha: 'caixaT3@', nome: 'Caixa 3 - Tarde', caixaPadrao: 'Caixa 3', turnoPadrao: 'Tarde' },
  { email: 'caixa4ttnp@fechamentocaixa.local', senha: 'caixaT4@', nome: 'Caixa 4 - Tarde', caixaPadrao: 'Caixa 4', turnoPadrao: 'Tarde' },
  { email: 'caixa5ttnp@fechamentocaixa.local', senha: 'caixa5GT@', nome: 'Caixa 5 - Tarde', caixaPadrao: 'Caixa 5', turnoPadrao: 'Tarde' },
];

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
