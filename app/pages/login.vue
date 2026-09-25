<script setup lang="ts">
import { useAuth } from '~/composables/useAuth';
import { mensagemDeErro } from '~/utils/erros';

// Única tela pública (ver middleware/auth.global.ts) — sem sidebar/topbar do app.
definePageMeta({ layout: false });

const email = ref('');
const password = ref('');
const carregando = ref(false);
const erro = ref<string | null>(null);

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
  <v-container class="fill-height" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card class="pa-6 cartao-login" elevation="0">
          <img class="logo-login" src="/marca/logo-cicluz.png" alt="Cicluz Gestão Profissional" />
          <v-card-title class="text-h5 mb-2">Fechamento de Caixa</v-card-title>
          <v-card-subtitle class="mb-4">Entre com sua conta para continuar</v-card-subtitle>

          <v-form @submit.prevent="entrar">
            <v-text-field
              v-model="email"
              label="E-mail"
              type="email"
              autocomplete="username"
              required
              class="mb-2"
            />
            <v-text-field
              v-model="password"
              label="Senha"
              type="password"
              autocomplete="current-password"
              required
              class="mb-2"
            />

            <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">
              {{ erro }}
            </v-alert>

            <v-btn type="submit" color="primary" block size="large" :loading="carregando">
              Entrar
            </v-btn>
          </v-form>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* Cartão de login: superfície grande, per hierarquia de raio/elevação --cx-* (67 §5/§6) —
   "cartão de login" é literalmente um dos exemplos de --cx-r-xl/--cx-e-3 da referência. */
.cartao-login {
  border-radius: var(--cx-r-xl) !important;
  box-shadow: var(--cx-e-3) !important;
}

.logo-login {
  display: block;
  width: min(100%, 180px);
  height: auto;
  margin: 0 auto var(--cx-sp-5);
}
</style>
