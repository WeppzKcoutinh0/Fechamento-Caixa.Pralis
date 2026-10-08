<script setup lang="ts">
import { useAuth } from '~/composables/useAuth';
import { mensagemDeErro } from '~/utils/erros';

// Única tela pública (ver middleware/auth.global.ts) — sem sidebar/topbar do app.
definePageMeta({ layout: false });

const email = ref('');
const password = ref('');
const carregando = ref(false);
const erro = ref<string | null>(null);
const mostrarSenha = ref(false);

const { signIn } = useAuth();
const router = useRouter();

async function entrar() {
  erro.value = null;
  carregando.value = true;
  try {
    await signIn(email.value, password.value);
    await router.replace('/');
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível entrar.');
  } finally {
    carregando.value = false;
  }
}
</script>

<template>
  <v-container class="login-page fill-height" fluid>
    <div class="login-page__luz login-page__luz--superior" aria-hidden="true" />
    <div class="login-page__luz login-page__luz--inferior" aria-hidden="true" />
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card class="pa-6 login-card" elevation="0">
          <img class="logo-login" src="/marca/logo-cicluz-dark.png" alt="Cicluz Gestão Profissional" />
          <v-card-title class="login-title">Sistema Inteligente</v-card-title>
          <v-card-subtitle class="login-subtitle">Fechamento de Caixa</v-card-subtitle>

          <v-form @submit.prevent="entrar">
            <v-text-field
              v-model="email"
              label="E-mail"
              type="email"
              autocomplete="username"
              prepend-inner-icon="mdi-email-outline"
              required
              class="mb-2"
            />
            <v-text-field
              v-model="password"
              label="Senha"
              :type="mostrarSenha ? 'text' : 'password'"
              autocomplete="current-password"
              prepend-inner-icon="mdi-lock-outline"
              :append-inner-icon="mostrarSenha ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              required
              class="mb-2"
              @click:append-inner="mostrarSenha = !mostrarSenha"
            />

            <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">
              {{ erro }}
            </v-alert>

            <v-btn type="submit" class="login-submit" block size="large" :loading="carregando" append-icon="mdi-arrow-right">
              Entrar no sistema
            </v-btn>
          </v-form>
          <p class="login-slogan">Clareza em cada ciclo do seu negócio</p>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* Cartão de login: superfície grande, per hierarquia de raio/elevação --cx-* (67 §5/§6) —
   "cartão de login" é literalmente um dos exemplos de --cx-r-xl/--cx-e-3 da referência. */
.login-page {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  isolation: isolate;
  background: #10151d;
}

.login-page__luz {
  position: fixed;
  z-index: -1;
  width: min(78vw, 720px);
  aspect-ratio: 1;
  border-radius: 999px;
  filter: blur(20px);
  opacity: 0.28;
  pointer-events: none;
  animation: flutuar 12s ease-in-out infinite alternate;
}

.login-page__luz--superior { top: -35%; left: -18%; background: #6515dd; }
.login-page__luz--inferior { right: -20%; bottom: -42%; background: #0ea5e9; animation-delay: -6s; }

.login-card {
  width: min(100%, 420px);
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 24px !important;
  color: #f8fafc;
  background: rgba(25, 31, 38, 0.96) !important;
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.36) !important;
  animation: entrar 360ms ease-out both;
}

.logo-login {
  display: block;
  width: min(100%, 220px);
  height: auto;
  margin: 0 auto 28px;
}

.login-title { padding: 0; color: #fff; font-size: clamp(1.5rem, 5vw, 1.9rem); font-weight: 700; text-align: center; }
.login-subtitle { padding: 0; margin: 7px 0 26px; color: #b5beca; text-align: center; }
.login-card :deep(.v-field) { color: #f8fafc; background: rgba(255, 255, 255, 0.035); }
.login-card :deep(.v-field__outline) { color: rgba(220, 227, 237, 0.48); }
.login-card :deep(.v-label), .login-card :deep(input) { color: #dce3ed; }
.login-card :deep(.v-field--focused .v-field__outline), .login-card :deep(.v-field--focused .v-label) { color: #b889ff; }
.login-submit { min-height: 48px; color: #fff !important; font-weight: 700; text-transform: none; background: #6515dd !important; box-shadow: 0 12px 26px rgba(101, 21, 221, 0.32) !important; }
.login-slogan { margin: 28px 0 0; color: #b5beca; font-size: 0.82rem; font-style: italic; text-align: center; }

@keyframes entrar { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes flutuar { to { transform: translate(8%, 5%) scale(1.08); } }

@media (max-width: 390px) {
  .login-card { border-radius: 20px !important; }
  .logo-login { width: min(100%, 190px); }
}

@media (prefers-reduced-motion: reduce) {
  .login-card, .login-page__luz { animation: none; }
}
</style>
