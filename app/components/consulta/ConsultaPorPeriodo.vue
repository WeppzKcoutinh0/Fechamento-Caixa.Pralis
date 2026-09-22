<script setup lang="ts">
// Tela de consulta por data + horário (Entradas/Transferências/Saídas do menu). O horário filtra
// pelo `criado_em` do fechamento — o único horário real que existe (ver utils/consultaPeriodo.ts);
// não existe horário individual por entrada/sangria/lançamento no banco.
//
// Data EDITÁVEL de propósito (18/09/2026, pedido explícito do usuário) — exceção à regra geral
// de "todo campo de data travado em hoje": esta tela é uma ferramenta de CONSULTA histórica pro
// admin (escolher qualquer dia passado e ver as entradas/saídas daquele dia), não um dado
// operacional do fechamento de hoje.
import { computed, ref } from 'vue';
import { useConsultaPeriodo } from '~/composables/useConsultaPeriodo';
import { formatCents } from '~/utils/financeiro';
import { somarValores, type TipoConsulta } from '~/utils/consultaPeriodo';
import { hojeISO } from '~/types/fechamento';

const props = defineProps<{ tipo: TipoConsulta; titulo: string; icone: string; cor: string }>();

const data = ref(hojeISO());
const horarioDe = ref('00:00');
const horarioAte = ref('23:59');
const jaBuscou = ref(false);

const { carregando, erro, linhas, buscar } = useConsultaPeriodo();

async function filtrar() {
  jaBuscou.value = true;
  await buscar({
    data: data.value,
    horarioDe: horarioDe.value,
    horarioAte: horarioAte.value,
    tipo: props.tipo,
  });
}

const totalCents = computed(() => somarValores(linhas.value));

function horaDoRegistro(criadoEm: string): string {
  return new Date(criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <div class="d-flex align-center ga-2 mb-6">
      <span class="consulta-disco" :style="{ '--disco-cor': cor }"
        ><v-icon :icon="icone" size="20"
      /></span>
      <h1 class="text-h5">{{ titulo }}</h1>
    </div>

    <v-card class="pa-4 mb-6" variant="outlined" rounded="lg">
      <div class="d-flex flex-column flex-sm-row ga-3 align-sm-end flex-wrap">
        <v-text-field v-model="data" label="Data" type="date" style="max-width: 200px" />
        <v-text-field v-model="horarioDe" label="Horário de" type="time" style="max-width: 160px" />
        <v-text-field
          v-model="horarioAte"
          label="Horário até"
          type="time"
          style="max-width: 160px"
        />
        <v-btn
          color="primary"
          :loading="carregando"
          :disabled="carregando || !data"
          @click="filtrar"
        >
          {{ carregando ? 'Buscando...' : 'Filtrar' }}
        </v-btn>
      </div>
      <p class="text-caption text-medium-emphasis mt-2 mb-0">
        O horário filtra pelo momento em que o fechamento foi salvo — não existe horário individual
        por lançamento.
      </p>
    </v-card>

    <template v-if="jaBuscou && !carregando">
      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

      <v-alert v-else-if="linhas.length === 0" type="info" variant="tonal">
        Nenhum registro encontrado nesse período.
      </v-alert>

      <template v-else>
        <v-table density="comfortable" class="mb-3">
          <thead>
            <tr>
              <th>Horário</th>
              <th>Descrição</th>
              <th>Detalhe</th>
              <th>Caixa / Turno</th>
              <th class="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(linha, i) in linhas" :key="`${linha.fechamentoId}-${i}`">
              <td>{{ horaDoRegistro(linha.criadoEm) }}</td>
              <td>{{ linha.descricao }}</td>
              <td class="text-medium-emphasis">{{ linha.detalhe }}</td>
              <td class="text-medium-emphasis">{{ linha.caixa }} · {{ linha.turno }}</td>
              <td class="text-right" :class="{ 'text-error': linha.valorCents < 0 }">
                R$ {{ formatCents(Math.abs(linha.valorCents)) }}
              </td>
            </tr>
          </tbody>
        </v-table>
        <div class="d-flex justify-end">
          <strong>Total: R$ {{ formatCents(totalCents) }}</strong>
        </div>
      </template>
    </template>
  </v-container>
</template>

<style scoped>
.consulta-disco {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--disco-cor);
  color: #fff;
}
</style>
