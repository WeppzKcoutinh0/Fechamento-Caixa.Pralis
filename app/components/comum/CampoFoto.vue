<script setup lang="ts">
import { ref } from 'vue';
import { useAnexos } from '~/composables/useAnexos';

const props = defineProps<{
  fechamentoId: string;
  campo: string;
  label: string;
  uploadAdiado?: boolean;
}>();
const modelValue = defineModel<string | null>({ default: null });
const emit = defineEmits<{
  arquivoSelecionado: [arquivo: File];
  arquivoRemovido: [];
}>();

const { enviar, remover } = useAnexos();
const enviando = ref(false);
const erro = ref<string | null>(null);
const arquivoPendente = ref(false);

async function aoEscolherArquivo(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const arquivo = input.files?.[0];
  if (!arquivo) return;

  erro.value = null;
  if (props.uploadAdiado) {
    arquivoPendente.value = true;
    emit('arquivoSelecionado', arquivo);
    input.value = '';
    return;
  }

  enviando.value = true;
  try {
    modelValue.value = await enviar(props.fechamentoId, props.campo, arquivo);
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível enviar a foto.';
  } finally {
    enviando.value = false;
    input.value = '';
  }
}

async function removerFoto(): Promise<void> {
  if (arquivoPendente.value) {
    emit('arquivoRemovido');
    arquivoPendente.value = false;
  }
  if (!modelValue.value) return;
  await remover(modelValue.value).catch(() => {});
  modelValue.value = null;
}
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-1">{{ label }}</div>
    <div v-if="modelValue || arquivoPendente" class="d-flex align-center ga-2">
      <v-chip prepend-icon="mdi-image" color="primary" variant="tonal">Foto anexada</v-chip>
      <v-btn
        icon="mdi-close"
        size="x-small"
        variant="text"
        aria-label="Remover foto"
        @click="removerFoto"
      />
    </div>
    <div v-else class="d-flex flex-wrap ga-2">
      <v-btn
        :loading="enviando"
        variant="outlined"
        prepend-icon="mdi-camera"
        size="small"
        @click="($refs.cameraInput as HTMLInputElement).click()"
      >
        Tirar foto
      </v-btn>
      <v-btn
        :loading="enviando"
        variant="text"
        prepend-icon="mdi-image-outline"
        size="small"
        @click="($refs.galleryInput as HTMLInputElement).click()"
      >
        Escolher da galeria
      </v-btn>
    </div>
    <input
      ref="cameraInput"
      type="file"
      accept="image/*"
      capture="environment"
      class="d-none"
      @change="aoEscolherArquivo"
    />
    <input
      ref="galleryInput"
      type="file"
      accept="image/*"
      class="d-none"
      @change="aoEscolherArquivo"
    />
    <div v-if="erro" class="text-caption text-error mt-1">{{ erro }}</div>
  </div>
</template>
