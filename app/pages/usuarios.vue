<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useUsuariosAdmin, type NovoUsuarioAdmin, type UsuarioAdmin } from '~/composables/useUsuariosAdmin';
import { mensagemDeErro } from '~/utils/erros';

definePageMeta({ middleware: ['admin'] });

const CAIXAS_OPERACIONAIS = ['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4'];
const TURNOS = ['Manhã', 'Tarde'] as const;
const { listar, criar } = useUsuariosAdmin();
const usuarios = ref<UsuarioAdmin[]>([]);
const carregando = ref(true);
const salvando = ref(false);
const erro = ref<string | null>(null);
const sucesso = ref<string | null>(null);
const mostrarSenha = ref(false);
const formulario = ref<NovoUsuarioAdmin>({
  nome: '', email: '', senha: '', role: 'caixa', caixaPadrao: 'Caixa 1', turnoPadrao: 'Manhã',
});
const operadores = computed(() => usuarios.value.filter((usuario) => usuario.role === 'caixa'));
const administradores = computed(() => usuarios.value.filter((usuario) => usuario.role === 'admin'));

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try { usuarios.value = await listar(); }
  catch (e) { erro.value = mensagemDeErro(e, 'Não foi possível carregar os usuários.'); }
  finally { carregando.value = false; }
}

async function salvar() {
  erro.value = null; sucesso.value = null; salvando.value = true;
  try {
    const novo = await criar({ ...formulario.value });
    usuarios.value = [novo, ...usuarios.value];
    sucesso.value = `${novo.nome} foi criado com sucesso.`;
    formulario.value = { nome: '', email: '', senha: '', role: 'caixa', caixaPadrao: 'Caixa 1', turnoPadrao: 'Manhã' };
  } catch (e) { erro.value = mensagemDeErro(e, 'Não foi possível criar o usuário.'); }
  finally { salvando.value = false; }
}
onMounted(carregar);
</script>

<template>
  <v-container class="py-6" style="max-width: 1100px">
    <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-6">
      <div>
        <h1 class="text-h5 font-weight-bold">Usuários e acessos</h1>
        <p class="text-body-2 text-medium-emphasis mb-0">Cadastre administradores e os oito acessos operacionais: Caixa 1 a 4, manhã e tarde.</p>
      </div>
      <v-chip color="primary" variant="tonal" prepend-icon="mdi-shield-account">Área administrativa</v-chip>
    </div>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>
    <v-alert v-if="sucesso" type="success" variant="tonal" closable class="mb-4" @click:close="sucesso = null">{{ sucesso }}</v-alert>

    <v-card variant="outlined" class="pa-5 mb-6">
      <div class="d-flex align-center ga-3 mb-4">
        <v-avatar color="primary" variant="tonal"><v-icon icon="mdi-account-plus" /></v-avatar>
        <div><h2 class="text-subtitle-1 font-weight-bold">Criar novo usuário</h2><div class="text-caption text-medium-emphasis">A conta já será liberada para entrar no sistema.</div></div>
      </div>
      <v-form @submit.prevent="salvar">
        <v-row>
          <v-col cols="12" md="6"><v-text-field v-model="formulario.nome" label="Nome do usuário" required prepend-inner-icon="mdi-account-outline" /></v-col>
          <v-col cols="12" md="6"><v-text-field v-model="formulario.email" label="E-mail de acesso" type="email" required prepend-inner-icon="mdi-email-outline" /></v-col>
          <v-col cols="12" md="4"><v-text-field v-model="formulario.senha" label="Senha" :type="mostrarSenha ? 'text' : 'password'" hint="Mínimo de 8 caracteres" persistent-hint required prepend-inner-icon="mdi-lock-outline" :append-inner-icon="mostrarSenha ? 'mdi-eye-off' : 'mdi-eye'" @click:append-inner="mostrarSenha = !mostrarSenha" /></v-col>
          <v-col cols="12" md="4"><v-select v-model="formulario.role" label="Tipo de usuário" :items="[{ title: 'Operador de caixa', value: 'caixa' }, { title: 'Administrador', value: 'admin' }]" item-title="title" item-value="value" /></v-col>
          <v-col v-if="formulario.role === 'caixa'" cols="12" md="2"><v-select v-model="formulario.caixaPadrao" label="Caixa" :items="CAIXAS_OPERACIONAIS" /></v-col>
          <v-col v-if="formulario.role === 'caixa'" cols="12" md="2"><v-select v-model="formulario.turnoPadrao" label="Turno" :items="TURNOS" /></v-col>
        </v-row>
        <div class="d-flex justify-end mt-2"><v-btn type="submit" color="primary" prepend-icon="mdi-account-plus" :loading="salvando">Criar usuário</v-btn></div>
      </v-form>
    </v-card>

    <v-card variant="outlined" class="pa-5">
      <div class="d-flex align-center justify-space-between mb-4"><h2 class="text-subtitle-1 font-weight-bold">Contas cadastradas</h2><v-btn icon="mdi-refresh" variant="text" :loading="carregando" aria-label="Atualizar usuários" @click="carregar" /></div>
      <div v-if="carregando" class="d-flex justify-center py-8"><v-progress-circular indeterminate color="primary" /></div>
      <v-alert v-else-if="usuarios.length === 0" type="info" variant="tonal">Nenhum usuário cadastrado.</v-alert>
      <div v-else class="usuarios-grid">
        <v-card v-for="usuario in usuarios" :key="usuario.id" variant="tonal" class="pa-4">
          <div class="d-flex align-center ga-3"><v-avatar :color="usuario.role === 'admin' ? 'primary' : 'success'" variant="tonal"><v-icon :icon="usuario.role === 'admin' ? 'mdi-shield-account' : 'mdi-cash-register'" /></v-avatar><div class="min-w-0"><div class="font-weight-bold text-truncate">{{ usuario.nome }}</div><div class="text-caption text-medium-emphasis text-truncate">{{ usuario.email }}</div></div></div>
          <v-divider class="my-3" />
          <div class="d-flex justify-space-between text-body-2"><span class="text-medium-emphasis">Acesso</span><strong>{{ usuario.role === 'admin' ? 'Administrador' : `${usuario.caixaPadrao} · ${usuario.turnoPadrao}` }}</strong></div>
        </v-card>
      </div>
      <div v-if="!carregando" class="text-caption text-medium-emphasis mt-4">{{ operadores.length }} operador{{ operadores.length === 1 ? '' : 'es' }} de caixa · {{ administradores.length }} administrador{{ administradores.length === 1 ? '' : 'es' }}</div>
    </v-card>
  </v-container>
</template>

<style scoped>
.usuarios-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
</style>
