<script setup lang="ts">
// Conferência de fundo de caixa (pedido do usuário, 23/09/2026): quando o operador marca "Não
// confirmar" na abertura (FormularioAbrirCaixa.vue), a divergência entre o que a Tesouraria
// cadastrou (valor_notas/valor_moedas em transferencias_tesouraria) e o que ele contou de verdade
// (fundo_valor_notas_contado/fundo_valor_moedas_contado em cash_sessions) vira uma pendência aqui.
// Mesmo padrão de página do historico.vue: query direta na página (sem composable dedicado),
// admin-only, junta profiles pra mostrar o nome do operador.
import { computed, onMounted, ref } from 'vue';
import { useSupabase } from '~/composables/useSupabase';
import { usePendenciasFundoCaixa } from '~/composables/usePendenciasFundoCaixa';
import { mensagemDeErro } from '~/utils/erros';
import { formatCents, toCents } from '~/utils/financeiro';
import { formatarDataBr } from '~/utils/vendasFechamento';
import AppCabecalhoTela from '~/components/app/AppCabecalhoTela.vue';

definePageMeta({ middleware: ['admin'] });

interface SessaoRow {
  id: string;
  caixa: string;
  turno: string;
  business_date: string;
  opened_at: string;
  opened_by: string;
  lacre_abertura: string;
  fundo_valor_notas_contado: string | null;
  fundo_valor_moedas_contado: string | null;
}
interface TransferenciaRow {
  lacre: string;
  valor_notas: string;
  valor_moedas: string;
}

interface LinhaPendencia {
  sessaoId: string;
  caixa: string;
  turno: string;
  businessDate: string;
  openedAt: string;
  operadorNome: string;
  lacre: string;
  notasCadastradasCents: number;
  moedasCadastradasCents: number;
  notasContadasCents: number;
  moedasContadasCents: number;
}

const supabase = useSupabase();
const { atualizarContagem } = usePendenciasFundoCaixa();

const carregando = ref(true);
const erro = ref<string | null>(null);
const linhas = ref<LinhaPendencia[]>([]);
const resolvendo = ref<string | null>(null);

async function carregar(): Promise<void> {
  carregando.value = true;
  erro.value = null;
  try {
    const { data: sessoes, error: erroSessoes } = await supabase
      .from('cash_sessions')
      .select(
        'id, caixa, turno, business_date, opened_at, opened_by, lacre_abertura, fundo_valor_notas_contado, fundo_valor_moedas_contado',
      )
      .eq('fundo_confirmado', false)
      .is('fundo_pendencia_resolvida_em', null)
      .order('opened_at', { ascending: false });
    if (erroSessoes) throw erroSessoes;

    const linhasSessoes = (sessoes ?? []) as SessaoRow[];
    const idsUsuarios = [...new Set(linhasSessoes.map((s) => s.opened_by))];
    const lacres = [...new Set(linhasSessoes.map((s) => s.lacre_abertura).filter(Boolean))];

    const [
      { data: perfis, error: erroPerfis },
      { data: transferencias, error: erroTransferencias },
    ] = await Promise.all([
      idsUsuarios.length
        ? supabase.from('profiles').select('user_id, nome').in('user_id', idsUsuarios)
        : Promise.resolve({ data: [], error: null }),
      lacres.length
        ? supabase
            .from('transferencias_tesouraria')
            .select('lacre, valor_notas, valor_moedas')
            .in('lacre', lacres)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (erroPerfis) throw erroPerfis;
    if (erroTransferencias) throw erroTransferencias;

    const nomePorUsuario = new Map(
      (perfis ?? []).map((p: { user_id: string; nome: string }) => [p.user_id, p.nome]),
    );
    const transferenciaPorLacre = new Map(
      ((transferencias ?? []) as TransferenciaRow[]).map((t) => [t.lacre, t]),
    );

    linhas.value = linhasSessoes.map((s) => {
      const transferencia = transferenciaPorLacre.get(s.lacre_abertura);
      return {
        sessaoId: s.id,
        caixa: s.caixa,
        turno: s.turno,
        businessDate: s.business_date,
        openedAt: s.opened_at,
        operadorNome: nomePorUsuario.get(s.opened_by) ?? '—',
        lacre: s.lacre_abertura,
        notasCadastradasCents: transferencia ? toCents(transferencia.valor_notas) : 0,
        moedasCadastradasCents: transferencia ? toCents(transferencia.valor_moedas) : 0,
        notasContadasCents: toCents(s.fundo_valor_notas_contado ?? '0'),
        moedasContadasCents: toCents(s.fundo_valor_moedas_contado ?? '0'),
      };
    });
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar as pendências.');
  } finally {
    carregando.value = false;
  }
}
onMounted(carregar);

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diferenca(cadastrado: number, contado: number): number {
  return contado - cadastrado;
}

async function resolver(sessaoId: string): Promise<void> {
  resolvendo.value = sessaoId;
  try {
    const { error: erroUpdate } = await supabase
      .from('cash_sessions')
      .update({ fundo_pendencia_resolvida_em: new Date().toISOString() })
      .eq('id', sessaoId)
      .select('id')
      .single();
    if (erroUpdate) throw erroUpdate;
    linhas.value = linhas.value.filter((l) => l.sessaoId !== sessaoId);
    await atualizarContagem();
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível marcar como resolvida.');
  } finally {
    resolvendo.value = null;
  }
}

const totalPendencias = computed(() => linhas.value.length);
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <AppCabecalhoTela titulo="Pendências de Abertura" />
    <p class="text-body-2 text-medium-emphasis mb-5">
      Sessões de caixa em que o operador contou notas/moedas diferentes do que a Tesouraria
      cadastrou pro lacre — não muda nada no cálculo do fechamento, é só pra você revisar.
    </p>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

    <div v-if="carregando" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert v-else-if="totalPendencias === 0" type="success" variant="tonal">
      Nenhuma pendência de fundo de caixa no momento.
    </v-alert>

    <div v-else class="d-flex flex-column ga-3">
      <v-card v-for="l in linhas" :key="l.sessaoId" variant="outlined" rounded="lg" class="pa-4">
        <div class="d-flex align-center flex-wrap ga-3 mb-3">
          <v-chip color="warning" size="small" variant="tonal">Não confirmado</v-chip>
          <strong>{{ l.caixa }} · {{ l.turno }}</strong>
          <span class="text-caption text-medium-emphasis"
            >{{ formatarDataBr(l.businessDate) }} · {{ formatarHora(l.openedAt) }}</span
          >
          <span class="text-caption text-medium-emphasis">{{ l.operadorNome }}</span>
          <span class="text-caption text-medium-emphasis">Lacre {{ l.lacre || '—' }}</span>
          <v-spacer />
          <v-btn
            size="small"
            variant="tonal"
            color="success"
            :loading="resolvendo === l.sessaoId"
            @click="resolver(l.sessaoId)"
          >
            Marcar como resolvida
          </v-btn>
        </div>

        <table class="tabela-conferencia">
          <thead>
            <tr>
              <th />
              <th>Cadastrado (Tesouraria)</th>
              <th>Contado (operador)</th>
              <th>Diferença</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Notas</td>
              <td>R$ {{ formatCents(l.notasCadastradasCents) }}</td>
              <td>R$ {{ formatCents(l.notasContadasCents) }}</td>
              <td
                :class="
                  diferenca(l.notasCadastradasCents, l.notasContadasCents) === 0
                    ? ''
                    : 'text-error font-weight-bold'
                "
              >
                R$ {{ formatCents(diferenca(l.notasCadastradasCents, l.notasContadasCents)) }}
              </td>
            </tr>
            <tr>
              <td>Moedas</td>
              <td>R$ {{ formatCents(l.moedasCadastradasCents) }}</td>
              <td>R$ {{ formatCents(l.moedasContadasCents) }}</td>
              <td
                :class="
                  diferenca(l.moedasCadastradasCents, l.moedasContadasCents) === 0
                    ? ''
                    : 'text-error font-weight-bold'
                "
              >
                R$ {{ formatCents(diferenca(l.moedasCadastradasCents, l.moedasContadasCents)) }}
              </td>
            </tr>
          </tbody>
        </table>
      </v-card>
    </div>
  </v-container>
</template>

<style scoped>
.tabela-conferencia {
  width: 100%;
  font-size: var(--cx-fs-caption);
  border-collapse: collapse;
}
.tabela-conferencia th {
  padding: var(--cx-sp-2);
  color: var(--cx-ink-soft);
  font-weight: 700;
  text-align: left;
}
.tabela-conferencia td {
  padding: var(--cx-sp-2);
  border-top: 1px solid var(--cx-line);
}
</style>
