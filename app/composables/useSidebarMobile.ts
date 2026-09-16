/**
 * Estado compartilhado entre `AppSidebar.vue` (o menu em si) e `CabecalhoPainel.vue` (o botão
 * hambúrguer que abre) — os dois precisam concordar exatamente no mesmo breakpoint "é celular ou
 * não" pra não ficarem dessincronizados (um decidir "mobile" e o outro não). Mesmo corte de 900px
 * já usado em `WizardFechamento.vue` pro layout da barra de etapas, por consistência.
 */
export function useSidebarMobile() {
  const aberto = useState('sidebar-mobile-aberto', () => false);
  const { width } = useDisplay();
  const mobile = computed(() => width.value < 900);
  return { aberto, mobile };
}
