import { getCurrentInstance } from 'vue';
import { useTheme } from 'vuetify';

// Modo claro/escuro global — mesmo mecanismo do Sistema Inteligente Pralís (useModoEscuro):
// seta `data-theme` no <html> (dispara a inversão dos tokens --cx-* em main.css) e troca o
// tema do Vuetify (fechamentoLight <-> fechamentoDark), senão os componentes Vuetify
// continuam calculados como claros por dentro. Persiste em localStorage.
const CHAVE = 'fechamento.modoEscuro';

export function useModoEscuro() {
  const escuro = useState('fechamento.modo-escuro', () => false);

  let temaVuetify: ReturnType<typeof useTheme> | null = null;
  if (getCurrentInstance()) {
    try {
      temaVuetify = useTheme();
    } catch {
      temaVuetify = null;
    }
  }

  function aplicar(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', escuro.value ? 'dark' : 'light');
    }
    temaVuetify?.change(escuro.value ? 'fechamentoDark' : 'fechamentoLight');
  }

  function inicializar(): void {
    if (typeof window === 'undefined') return;
    const salvo = window.localStorage?.getItem(CHAVE);
    escuro.value =
      salvo === '1' ||
      (salvo === null && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches));
    aplicar();
  }

  function alternar(): void {
    escuro.value = !escuro.value;
    aplicar();
    if (typeof window !== 'undefined')
      window.localStorage?.setItem(CHAVE, escuro.value ? '1' : '0');
  }

  return { escuro, inicializar, alternar };
}
