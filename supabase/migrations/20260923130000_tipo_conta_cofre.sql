-- Entrada do tipo COFRE: origem fixa no Cofre e destino derivado do caixa logado no formulário.
-- Os campos de origem/destino são informativos na UI; o valor persistido é o tipo_conta = COFRE.
alter table public.entradas drop constraint if exists entradas_tipo_conta_check;

alter table public.entradas add constraint entradas_tipo_conta_check
  check (
    tipo_conta is null or tipo_conta in (
      'CREDITO', 'DEBITO', 'PIX', 'VOUCHER', 'DINHEIRO',
      'COLABORADOR', 'SOBRA/PERDA', 'FURTO/ROUBO', 'LANCHES', 'COFRE'
    )
  );
