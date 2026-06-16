-- ============================================================================
-- Resultadismo · Estudos (biblioteca de análises/estudos SÓ PARA ADMIN)
-- ----------------------------------------------------------------------------
-- Decisão do João (2026-06-16): os documentos HTML de análise/estudo
-- (gamificação, Retrô, confrontos, planos) ficam reunidos numa área
-- "📚 Estudos" do /admin, acessível SÓ por app-admin, para os admins lerem e
-- comentarem os estudos do produto. O arquivo vive num bucket PRIVADO de
-- Storage; os metadados (título, categoria, descrição) ficam em study_docs.
-- Tudo gated por RLS via public.is_app_admin(). Nada público, nada para o
-- membro comum. Substitui o vazamento anterior em public/planos/*.html.
-- ============================================================================

-- 1) Bucket privado para os arquivos de estudo (HTML).
insert into storage.buckets (id, name, public)
values ('estudos', 'estudos', false)
on conflict (id) do nothing;

-- 2) RLS no storage.objects: só app-admin lê/escreve no bucket 'estudos'.
--    (sign/download exige SELECT → coberto pelo "for all".)
drop policy if exists "estudos_admin_all" on storage.objects;
create policy "estudos_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'estudos' and public.is_app_admin())
  with check (bucket_id = 'estudos' and public.is_app_admin());

-- 3) Catálogo dos estudos (o conteúdo vive no Storage; aqui só os metadados).
create table if not exists public.study_docs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'geral',
  description text,
  storage_path text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.study_docs is
  'Catálogo de estudos/análises (HTML) visíveis só por app-admin. Conteúdo no bucket Storage "estudos".';

create index if not exists study_docs_category_idx on public.study_docs (category, sort, created_at desc);

alter table public.study_docs enable row level security;

-- Só app-admin enxerga/gerencia (nada público, nada para membro comum).
drop policy if exists "study_docs_admin_all" on public.study_docs;
create policy "study_docs_admin_all" on public.study_docs
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- updated_at automático.
create or replace function public.touch_study_docs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists study_docs_touch on public.study_docs;
create trigger study_docs_touch before update on public.study_docs
  for each row execute function public.touch_study_docs();
