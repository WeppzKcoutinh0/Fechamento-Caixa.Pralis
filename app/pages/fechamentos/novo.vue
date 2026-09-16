<script setup lang="ts">
import { useFechamentoForm } from '~/composables/useFechamentoForm';
import WizardFechamento from '~/components/fechamento/WizardFechamento.vue';

const { novoFechamento } = useFechamentoForm();
novoFechamento();
</script>

<template>
  <WizardFechamento titulo="Novo Fechamento" />
</template>
