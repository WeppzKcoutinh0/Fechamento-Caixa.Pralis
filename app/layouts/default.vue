<script setup lang="ts">
// Casca do app (sidebar + topbar) — aplicada a toda página autenticada por padrão (só /login usa
// `layout: false`, ver pages/login.vue). Antes o cabeçalho (saudação/avatar) vivia só na home;
// agora é da CASCA, igual ao AppShell.vue do Sistema Inteligente Pralís/Cicluz — mesma ideia, sem
// os itens que não existem aqui (caixa aberto, empresa, notificações).
import { useRouter } from 'vue-router';
import { useAuth } from '~/composables/useAuth';
import AppSidebar from '~/components/app/AppSidebar.vue';
import CabecalhoPainel from '~/components/app/CabecalhoPainel.vue';

const { session, signOut } = useAuth();
const router = useRouter();

async function sair() {
  await signOut();
  await router.replace('/login');
}
</script>

<template>
  <v-layout>
    <AppSidebar />
    <v-main>
      <!-- Sem `v-container` aqui de propósito: cada página já tem o próprio (com o max-width que
           faz sentido pra ela — 900px no wizard, 1100px no painel). Duplicar o container aqui
           somaria padding vertical duas vezes (`py-6` + `py-6`). -->
      <div class="px-4 px-md-6 pt-4">
        <CabecalhoPainel :email="session?.user.email ?? ''" @sair="sair" />
      </div>
      <slot />
    </v-main>
  </v-layout>
</template>
