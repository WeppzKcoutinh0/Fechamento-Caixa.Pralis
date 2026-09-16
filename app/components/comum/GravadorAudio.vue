<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAnexos } from '~/composables/useAnexos';

const props = defineProps<{ fechamentoId: string; campo: string }>();
const modelValue = defineModel<string | null>({ default: null });

const { enviar, urlAssinada } = useAnexos();
const gravando = ref(false);
const enviando = ref(false);
const erro = ref<string | null>(null);
const urlReproducao = ref<string | null>(null);

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

async function atualizarUrlReproducao(): Promise<void> {
  urlReproducao.value = modelValue.value ? await urlAssinada(modelValue.value) : null;
}
watch(() => modelValue.value, atualizarUrlReproducao, { immediate: true });

async function alternarGravacao(): Promise<void> {
  if (gravando.value) {
    mediaRecorder?.stop();
    return;
  }

  erro.value = null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      gravando.value = false;
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const arquivo = new File([blob], `observacao-${Date.now()}.webm`, { type: 'audio/webm' });
      enviando.value = true;
      try {
        modelValue.value = await enviar(props.fechamentoId, props.campo, arquivo);
      } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível enviar o áudio.';
      } finally {
        enviando.value = false;
      }
    };
    mediaRecorder.start();
    gravando.value = true;
  } catch {
    erro.value = 'Microfone não disponível';
  }
}
</script>

<template>
  <div>
    <v-btn
      :color="gravando ? 'error' : 'primary'"
      :loading="enviando"
      variant="tonal"
      :prepend-icon="
        gravando ? 'mdi-stop' : modelValue ? 'mdi-microphone' : 'mdi-microphone-outline'
      "
      size="small"
      @click="alternarGravacao"
    >
      {{ gravando ? 'Gravando… toque para parar' : modelValue ? 'Regravar' : 'Gravar observação' }}
    </v-btn>
    <audio
      v-if="urlReproducao"
      :src="urlReproducao"
      controls
      class="d-block mt-2"
      style="height: 32px"
    />
    <div v-if="erro" class="text-caption text-error mt-1">{{ erro }}</div>
  </div>
</template>
