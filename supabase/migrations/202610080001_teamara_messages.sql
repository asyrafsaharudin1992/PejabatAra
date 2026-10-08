-- Shared TeamAra settings: WhatsApp message templates ('card', 'birthday') and
-- the storage path of the membership card template image ('card_template').
create table if not exists public.teamara_messages (
  key text primary key check (key in ('card', 'birthday', 'card_template')),
  body text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.teamara_messages enable row level security;

do $$ begin
  create policy "active staff read teamara messages" on public.teamara_messages for select using (exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
  create policy "admins manage teamara messages" on public.teamara_messages for all using (public.current_role() = 'super_admin') with check (public.current_role() = 'super_admin');
exception when duplicate_object then null;
end $$;

-- Card template images. Public so the browser can draw them onto the card canvas;
-- only System Admin can upload or remove them.
insert into storage.buckets (id, name, public) values ('teamara-templates', 'teamara-templates', true) on conflict (id) do nothing;

do $$ begin
  create policy "admins upload teamara templates" on storage.objects for insert with check (bucket_id = 'teamara-templates' and public.current_role() = 'super_admin');
  create policy "admins update teamara templates" on storage.objects for update using (bucket_id = 'teamara-templates' and public.current_role() = 'super_admin');
  create policy "admins delete teamara templates" on storage.objects for delete using (bucket_id = 'teamara-templates' and public.current_role() = 'super_admin');
exception when duplicate_object then null;
end $$;
