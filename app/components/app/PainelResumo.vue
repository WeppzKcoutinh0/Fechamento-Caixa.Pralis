<script setup lang="ts">
// Cards de resumo do painel inicial — mesma linguagem visual (cor por categoria, disco + rótulo +
// valor) do cockpit do Sistema Inteligente Pralís/Cicluz (ver web-vue/components/app/AppDashboard.vue
// daquele projeto) e do nosso próprio CockpitCategorias.vue. Diferente daquele componente: aqui os
// números são REAIS, somados de `utils/painel.ts` a partir dos fechamentos já salvos — nenhum dado
// de demonstração (o painel original do Pralís usa números fixos de `utils/dashboard-demo.ts` por
// decisão deles; aqui isso teria sido um vazamento de dado fictício apresentado como real).
import { computed } from 'vue';
import { formatCents } from '~/utils/financeiro';
import type { ResumoPainel } from '~/utils/painel';

const props = defineProps<{ resumo: ResumoPainel }>();

const saidasHojeCents = computed(
  () => props.resumo.despesasHojeCents + props.resumo.mercadoriasHojeCents + props.resumo.retiradasHojeCents,
);
</script>

<template>
  <div class="painel-resumo">
    <section class="painel-secao" aria-labelledby="painel-secao-hoje">
      <h2 id="painel-secao-hoje" class="painel-secao-titulo">Hoje</h2>
      <div class="painel-grade">
        <article class="painel-card painel-cor-transferencias">
          <span class="painel-bar" aria-hidden="true" />
          <div class="painel-corpo">
            <div class="painel-cabeca">
              <span class="painel-chip"><v-icon icon="mdi-cash-plus" size="18" /></span>
              <span class="painel-titulo">Entradas</span>
            </div>
            <div class="painel-valor cx-num">R$ {{ formatCents(resumo.entradasHojeCents) }}</div>
          </div>
        </article>

        <article class="painel-card painel-cor-despesas">
          <span class="painel-bar" aria-hidden="true" />
          <div class="painel-corpo">
            <div class="painel-cabeca">
              <span class="painel-chip"><v-icon icon="mdi-cash-minus" size="18" /></span>
              <span class="painel-titulo">Saídas</span>
            </div>
            <div class="painel-valor cx-num">R$ {{ formatCents(saidasHojeCents) }}</div>
            <div class="painel-detalhe">
              despesas {{ formatCents(resumo.despesasHojeCents) }} · mercadorias
              {{ formatCents(resumo.mercadoriasHojeCents) }} · retiradas
              {{ formatCents(resumo.retiradasHojeCents) }}
            </div>
          </div>
        </article>

        <article class="painel-card painel-cor-resultado">
          <span class="painel-bar" aria-hidden="true" />
          <div class="painel-corpo">
            <div class="painel-cabeca">
              <span class="painel-chip"><v-icon icon="mdi-scale-balance" size="18" /></span>
              <span class="painel-titulo">Resultado</span>
            </div>
            <div class="painel-valor cx-num">R$ {{ formatCents(resumo.resultadoHojeCents) }}</div>
            <div class="painel-detalhe">
              {{ resumo.fechamentosHoje }} fechamento{{ resumo.fechamentosHoje === 1 ? '' : 's' }} hoje
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="painel-secao painel-secao--mt" aria-labelledby="painel-secao-mes">
      <h2 id="painel-secao-mes" class="painel-secao-titulo">Este mês</h2>
      <div class="painel-grade">
        <article class="painel-card painel-cor-mercadorias">
          <span class="painel-bar" aria-hidden="true" />
          <div class="painel-corpo">
            <div class="painel-cabeca">
              <span class="painel-chip"><v-icon icon="mdi-file-document-multiple-outline" size="18" /></span>
              <span class="painel-titulo">Fechamentos</span>
            </div>
            <div class="painel-valor cx-num">{{ resumo.fechamentosMes }}</div>
          </div>
        </article>

        <article class="painel-card painel-cor-retiradas">
          <span class="painel-bar" aria-hidden="true" />
          <div class="painel-corpo">
            <div class="painel-cabeca">
              <span class="painel-chip"><v-icon icon="mdi-alert-circle-outline" size="18" /></span>
              <span class="painel-titulo">Diferenças a verificar</span>
            </div>
            <div class="painel-valor cx-num">{{ resumo.diferencasPendentesMes }}</div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Mesma estrutura de CockpitCategorias.vue (bar + chip + título + valor, cor como acento, fundo
   -soft, nunca a estrutura inteira colorida) — mantido independente daquele componente (não
   compartilha CSS) para não arriscar o que já está pronto e testado ali. */
.painel-secao--mt {
  margin-top: var(--cx-sp-6);
}

.painel-secao-titulo {
  margin-bottom: var(--cx-sp-3);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  font-weight: 800;
  letter-spacing: var(--cx-tracking-wide);
  text-transform: uppercase;
}

.painel-grade {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--cx-sp-3);
}

.painel-card {
  position: relative;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--cat);
  border-radius: var(--cx-r-lg);
  background: var(--cat-soft);
}

.painel-bar {
  flex: 0 0 6px;
  background: var(--cat);
}

.painel-corpo {
  min-width: 0;
  padding: var(--cx-sp-4);
}

.painel-cabeca {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
}

.painel-chip {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--cx-r-sm);
  background: var(--cat);
  color: #fff;
}

.painel-titulo {
  overflow: hidden;
  color: var(--cat-tinta);
  font-size: var(--cx-fs-micro);
  font-weight: 800;
  letter-spacing: var(--cx-tracking-wide);
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.painel-valor {
  margin-top: var(--cx-sp-2);
  color: var(--cat-tinta);
  font-size: var(--cx-fs-h2);
  font-weight: 800;
  line-height: 1.1;
}

.painel-detalhe {
  margin-top: 2px;
  overflow: hidden;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.painel-cor-transferencias {
  --cat: var(--cat-transferencias-base);
  --cat-soft: var(--cat-transferencias-soft);
  --cat-tinta: var(--cat-transferencias-tinta);
}
.painel-cor-despesas {
  --cat: var(--cat-despesas-base);
  --cat-soft: var(--cat-despesas-soft);
  --cat-tinta: var(--cat-despesas-tinta);
}
.painel-cor-mercadorias {
  --cat: var(--cat-mercadorias-base);
  --cat-soft: var(--cat-mercadorias-soft);
  --cat-tinta: var(--cat-mercadorias-tinta);
}
.painel-cor-retiradas {
  --cat: var(--cat-retiradas-base);
  --cat-soft: var(--cat-retiradas-soft);
  --cat-tinta: var(--cat-retiradas-tinta);
}
.painel-cor-resultado {
  --cat: var(--cat-resultado-base);
  --cat-soft: var(--cat-resultado-soft);
  --cat-tinta: var(--cat-resultado-tinta);
}

@media (width <= 480px) {
  .painel-grade {
    grid-template-columns: 1fr;
  }
}
</style>
