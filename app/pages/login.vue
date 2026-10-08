<script setup lang="ts">
import { getCurrentInstance, onMounted, onUnmounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuth } from '~/composables/useAuth';
import { mensagemDeErro } from '~/utils/erros';

definePageMeta({ layout: false });

const email = ref('');
const password = ref('');
const carregando = ref(false);
const erro = ref<string | null>(null);
const mostrarSenha = ref(false);
const { signIn } = useAuth();
const router = useRouter();

// A entrada tem identidade escura própria. A preferência do usuário para o restante do sistema
// é restaurada ao sair desta página, portanto autenticar não altera a escolha de tema dele.
const tema = getCurrentInstance() ? useTheme() : null;
let temaAnterior: string | null = null;
let atributoAnterior: string | null = null;
useHead({ htmlAttrs: { 'data-theme': 'dark' } });

onMounted(() => {
  atributoAnterior = document.documentElement.getAttribute('data-theme');
  temaAnterior = tema?.global.name.value ?? null;
  document.documentElement.setAttribute('data-theme', 'dark');
  tema?.change('fechamentoDark');
});

onUnmounted(() => {
  if (atributoAnterior === null) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', atributoAnterior);
  if (temaAnterior) tema?.change(temaAnterior);
});

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
  <v-main class="login-page tela-entrada d-flex align-center justify-center pa-4">
    <AppFundoEntrada />

    <v-card class="login-card cartao-entrada" elevation="0">
      <div class="login-brand" aria-label="Cicluz Gestão Profissional">
        <AppLogoAnimada size="clamp(96px, 15vh, 128px)" :glow-intensity="0.26" />
        <span class="login-brand__word">
          <img src="/marca/cicluz-palavra.svg" alt="Cicluz" />
          <span>Gestão Profissional</span>
        </span>
      </div>

      <div class="login-head">
        <h1>Sistema Inteligente</h1>
        <p>Fechamento de Caixa</p>
      </div>

      <v-form class="login-form" @submit.prevent="entrar">
        <v-text-field
          v-model="email"
          label="E-mail"
          placeholder="voce@cicluz.com.br"
          autocomplete="email"
          name="email"
          type="email"
          prepend-inner-icon="mdi-email-outline"
          hide-details="auto"
          required
        />
        <v-text-field
          v-model="password"
          label="Senha"
          autocomplete="current-password"
          name="password"
          :type="mostrarSenha ? 'text' : 'password'"
          prepend-inner-icon="mdi-lock-outline"
          :append-inner-icon="mostrarSenha ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
          hide-details="auto"
          required
          @click:append-inner="mostrarSenha = !mostrarSenha"
        />

        <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="login-alert">
          {{ erro }}
        </v-alert>

        <v-btn type="submit" class="login-submit" block size="large" :loading="carregando" append-icon="mdi-arrow-right">
          Entrar no sistema
        </v-btn>
      </v-form>

      <p class="login-slogan">Clareza em cada ciclo do seu negócio</p>
    </v-card>
  </v-main>
</template>

<style scoped>
.login-page {
  position: relative;
  isolation: isolate;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--cx-canvas);
}

.login-card {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  max-width: min(420px, calc(100vw - 32px));
  min-width: 0;
  padding: var(--cx-sp-8) var(--cx-sp-7) var(--cx-sp-6);
  border: 1px solid var(--cx-line-soft) !important;
  border-radius: var(--cx-r-xl) !important;
  background: color-mix(in srgb, var(--cx-surface) 42%, transparent) !important;
  box-shadow: var(--cx-e-3) !important;
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  animation: login-in var(--cx-dur-3) var(--cx-ease-out) both;
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  margin-bottom: var(--cx-sp-5);
  animation: login-in var(--cx-dur-3) var(--cx-ease-out) 60ms both;
}

.login-brand__word {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: min(190px, 62vw);
}

.login-brand__word img { display: block; width: 100%; height: auto; }
.login-brand__word span { color: var(--cx-ink-soft); font-size: var(--cx-fs-micro); font-weight: 500; letter-spacing: 0.06em; line-height: 1.1; white-space: nowrap; }

.login-head { margin-bottom: var(--cx-sp-6); text-align: center; animation: login-in var(--cx-dur-3) var(--cx-ease-out) 110ms both; }
.login-head h1 { margin: 0; color: var(--cx-ink); font-size: var(--cx-fs-h2); font-weight: 700; letter-spacing: var(--cx-tracking-tight); }
.login-head p { margin: var(--cx-sp-1) 0 0; color: var(--cx-ink-soft); font-size: var(--cx-fs-body); font-weight: 500; }

.login-form { display: grid; gap: var(--cx-sp-4); animation: login-in var(--cx-dur-3) var(--cx-ease-out) 160ms both; }
.login-alert { margin: -2px 0; }
.login-card :deep(.v-field) {
  background: #fff !important;
  color: #1f2937;
}
.login-card :deep(.v-field__overlay) { background: #fff !important; opacity: 1; }
.login-card :deep(.v-field__input),
.login-card :deep(.v-label),
.login-card :deep(.v-field__prepend-inner),
.login-card :deep(.v-field__append-inner) { color: #1f2937; }
.login-card :deep(.v-field__input::placeholder) { color: #6b7280; opacity: 1; }
.login-card :deep(.v-field--focused .v-field__outline) { color: var(--cx-focus); }
.login-card :deep(.v-field--focused .v-label) { color: var(--cx-brand-text); }
.login-card :deep(.v-field--focused) { box-shadow: 0 0 0 3px color-mix(in srgb, var(--cx-brand) 25%, transparent); }

.login-submit { margin-top: var(--cx-sp-1); min-height: 48px; background: var(--cx-brand) !important; color: var(--cx-brand-on) !important; font-weight: 700; letter-spacing: 0.01em; text-transform: none; box-shadow: 0 10px 22px color-mix(in srgb, var(--cx-brand) 30%, transparent) !important; }
.login-slogan { margin: var(--cx-sp-6) 0 var(--cx-sp-1); color: var(--cx-ink-soft); font-size: var(--cx-fs-caption); font-style: italic; text-align: center; animation: login-in var(--cx-dur-3) var(--cx-ease-out) 220ms both; }

@keyframes login-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (max-width: 390px) {
  .login-card { padding: var(--cx-sp-6) var(--cx-sp-5) var(--cx-sp-5); border-radius: var(--cx-r-lg) !important; }
  .login-brand { gap: var(--cx-sp-2); }
  .login-brand__word { width: min(150px, 48vw); }
}
@media (prefers-reduced-motion: reduce) { .login-card, .login-brand, .login-head, .login-form, .login-slogan { animation: none; } }
</style>
