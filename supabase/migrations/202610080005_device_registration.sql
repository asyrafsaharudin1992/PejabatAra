-- Registered devices (Plato-style). Staff can only use AraOffice from a device
-- registered with the device security key; a registration lasts 30 days.
-- System Admins are exempt so they can never be locked out.
--
-- The lock only takes effect once a System Admin generates a security key in
-- Control Centre, so deploying this changes nothing until then.

create extension if not exists pgcrypto with schema extensions;

-- Single row holding the current security key (hash only).
create table if not exists public.device_settings (
  id boolean primary key default true check (id),
  key_hash text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.registered_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  registered_by uuid references auth.users(id) on delete set null,
  registered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz
);

-- Only the service role (the API) reads or writes these tables.
alter table public.device_settings enable row level security;
alter table public.registered_devices enable row level security;

-- True when the device lock is off, or the request carries the token of a
-- registered, unexpired, unrevoked device in its x-device-token header.
create or replace function public.device_lock_satisfied()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not exists (select 1 from public.device_settings where key_hash is not null)
    or exists (
      select 1 from public.registered_devices d
      where d.revoked_at is null
        and d.expires_at > now()
        and d.token_hash = encode(extensions.digest(
          coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-device-token', ''),
          'sha256'), 'hex')
    )
$$;

-- Office access now also requires a registered device for everyone except System Admins.
create or replace function public.has_office(office text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role = 'super_admin'
        or (
          coalesce(auth.jwt() -> 'app_metadata' -> 'office_access', '[]'::jsonb) ? office
          and public.device_lock_satisfied()
        )
      )
  )
$$;
