-- Bucket de anexos (fotos de PDV/maquininha/lançamento/nota/cupom, áudio de observação).
-- Hoje esses campos existem na tela e nunca funcionam (app-storage.js/IndexedDB carregado mas
-- nunca chamado) — implementação real via Supabase Storage, decisão confirmada no plano.

insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

create policy "anexos_authenticated_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'anexos');

create policy "anexos_authenticated_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'anexos');

create policy "anexos_authenticated_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'anexos')
  with check (bucket_id = 'anexos');

create policy "anexos_authenticated_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'anexos');
