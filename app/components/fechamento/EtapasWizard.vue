<script setup lang="ts">
// Barra lateral de etapas do assistente — só em telas largas (>=900px, ver <style>). Em telas
// estreitas o WizardFechamento mostra a barra de progresso + pontos de sempre, sem overflow
// horizontal. Navegação livre entre etapas: o próprio useFechamentoForm::irPara não valida nada
// (mesmo comportamento não-bloqueante do app original), então pular pra qualquer etapa é seguro.
defineProps<{
  etapas: readonly string[];
  etapaAtual: number;
}>();

const emit = defineEmits<{ (e: 'ir-para', etapa: number): void }>();
</script>

<template>
  <nav class="etapas-wizard" aria-label="Etapas do fechamento">
    <button
      v-for="(etapa, indice) in etapas"
      :key="etapa"
      type="button"
      class="etapa-item"
      :class="{
        'etapa-atual': indice + 1 === etapaAtual,
        'etapa-concluida': indice + 1 < etapaAtual,
      }"
      :aria-current="indice + 1 === etapaAtual ? 'step' : undefined"
      @click="emit('ir-para', indice + 1)"
    >
      <span class="etapa-marcador">
        <v-icon v-if="indice + 1 < etapaAtual" icon="mdi-check" size="14" />
        <template v-else>{{ indice + 1 }}</template>
      </span>
      <span class="etapa-rotulo">{{ etapa }}</span>
    </button>
  </nav>
</template>

<style scoped>
.etapas-wizard {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-1);
  padding-right: var(--cx-sp-4);
}

.etapa-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border: 0;
  border-radius: var(--cx-r-md);
  background: transparent;
  color: var(--cx-ink-soft);
  font-family: inherit;
  font-size: var(--cx-fs-body);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--cx-dur-1) var(--cx-ease),
    color var(--cx-dur-1) var(--cx-ease);
}

/* Conecta os marcadores por uma linha fina, como um passo-a-passo de verdade. */
.etapa-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: calc(var(--cx-sp-3) + 11px);
  top: calc(100% - 2px);
  width: 1px;
  height: var(--cx-sp-1);
  background: var(--cx-line);
}

.etapa-item:hover {
  background: var(--cx-hover);
}

.etapa-marcador {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1.5px solid var(--cx-line);
  border-radius: var(--cx-r-pill);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 600;
}

.etapa-rotulo {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.etapa-item.etapa-concluida .etapa-marcador {
  border-color: var(--cx-brand);
  background: var(--cx-brand);
  color: var(--cx-brand-on);
}
.etapa-item.etapa-concluida .etapa-rotulo {
  color: var(--cx-ink);
}

/* Item ATUAL: três sinais, não só cor — fundo, peso de fonte e barra lateral. */
.etapa-item.etapa-atual {
  background: var(--cx-brand-wash);
  font-weight: 600;
}
.etapa-item.etapa-atual .etapa-marcador {
  border-color: var(--cx-brand);
  color: var(--cx-brand-text);
}
.etapa-item.etapa-atual .etapa-rotulo {
  color: var(--cx-ink);
}
.etapa-item.etapa-atual::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: var(--cx-r-pill);
  background: var(--cx-brand);
}
</style>
