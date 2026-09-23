<script setup lang="ts">
// Topbar do painel inicial — porta a saudação/relógio e o menu de usuário (avatar com iniciais)
// de `web-vue/components/app/AppShell.vue` (Sistema Inteligente Pralís/Cicluz), sem os itens que
// dependem de conceitos que este app não tem: status de caixa aberto, seletor de empresa (loja
// única) e sino de notificações (não existe sistema de notificação aqui — decisão confirmada com
// o usuário: nada de pílula/contador fictício).
import { computed, onMounted, onUnmounted, ref } from 'vue';
import BotaoModoEscuro from '~/components/app/BotaoModoEscuro.vue';
import { useSidebarMobile } from '~/composables/useSidebarMobile';
import { lerRelogio, type Relogio } from '~/utils/saudacao';

const props = defineProps<{ email: string }>();
const emit = defineEmits<{ (event: 'sair'): void }>();

// Único jeito de abrir o menu em telas de celular agora que ele deixou de ficar sempre visível
// (ver AppSidebar.vue) — mesmo estado compartilhado, mesmo corte de 900px.
const { aberto: menuAberto, mobile } = useSidebarMobile();

const primeiroNome = computed(() => props.email.split('@')[0] || 'Usuário');
const iniciais = computed(() => (primeiroNome.value[0] ?? 'U').toUpperCase());

// Relógio nasce só no client (evita descompasso de hidratação) e atualiza por minuto — o formato
// é HH:mm, redesenhar por segundo seria trabalho sem efeito visível.
const relogio = ref<Relogio | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  const ler = () => (relogio.value = lerRelogio(new Date()));
  ler();
  timer = setInterval(ler, 60_000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <header class="cabecalho-painel">
    <div class="cp-esquerda">
      <v-btn
        v-if="mobile"
        icon="mdi-menu"
        variant="text"
        density="comfortable"
        aria-label="Abrir menu"
        class="cp-menu-btn"
        @click="menuAberto = true"
      />
      <p v-if="relogio" class="cp-relogio">
        <span class="cp-saudacao"
          >{{ relogio.saudacao }}<span class="cp-nome">, {{ primeiroNome }}</span></span
        >
        <span class="cp-hora">{{ relogio.hora }}</span>
        <span class="cp-data">{{ relogio.data }}</span>
      </p>
    </div>

    <div class="cp-acoes">
      <BotaoModoEscuro />
      <v-menu location="bottom end">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" type="button" class="cp-usuario" :title="email">
            <span class="cp-avatar">{{ iniciais }}</span>
          </button>
        </template>
        <v-list min-width="220" density="compact">
          <v-list-item :subtitle="email" />
          <v-divider />
          <v-list-item prepend-icon="mdi-logout" title="Sair" @click="emit('sair')" />
        </v-list>
      </v-menu>
    </div>
  </header>
</template>

<style scoped>
.cabecalho-painel {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  margin-bottom: var(--cx-sp-6);
}

.cp-esquerda {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.cp-menu-btn {
  flex: 0 0 auto;
  margin-left: calc(var(--cx-sp-2) * -1);
}

.cp-relogio {
  display: flex;
  align-items: baseline;
  gap: var(--cx-sp-2);
  margin: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-body);
}

/* Em telas estreitas, "Nome, saudação" pode ser mais longo que o espaço disponível ao lado do
   avatar — trunca com reticências em vez de empurrar o avatar pra uma segunda linha (bug
   reportado pelo usuário: o avatar "sumia" lá embaixo no mobile). Hora nunca encolhe/trunca. */
.cp-saudacao {
  overflow: hidden;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--cx-ink);
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cp-nome {
  font-weight: 600;
}

.cp-hora {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.cp-data {
  flex: 0 0 auto;
  text-transform: capitalize;
}

.cp-acoes {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--cx-sp-2);
}

.cp-usuario {
  display: flex;
  align-items: center;
  border: 0;
  background: none;
  cursor: pointer;
}

.cp-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  background: var(--cx-brand);
  color: var(--cx-brand-on);
  font-size: var(--cx-fs-caption);
  font-weight: 700;
}

@media (width <= 560px) {
  .cp-data {
    display: none;
  }
}
</style>
