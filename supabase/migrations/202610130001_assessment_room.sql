-- Assessment Room: the door at the front of the lobby where individual staff
-- take periodic MCQ assessments from their own phones. It does not use the
-- shared office accounts or the device lock; staff sign in with their name and
-- staff code, which System Admin records in Control Centre.

create table if not exists public.assessment_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  staff_code text not null unique,     -- upper case, letters and digits only (e.g. KJ012)
  branch text not null default '',
  active boolean not null default true,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.assessment_staff(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- questions: [{ id, text, options: string[], answer: number }]. Answers never
-- leave the API for staff; only System Admin sees them.
create table if not exists public.assessment_quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  pass_mark integer not null default 80 check (pass_mark between 0 and 100),
  active boolean not null default false,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- One attempt per staff per assessment; System Admin can clear it to allow a retake.
create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.assessment_quizzes(id) on delete cascade,
  staff_id uuid not null references public.assessment_staff(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  score integer not null,
  total integer not null,
  submitted_at timestamptz not null default now(),
  unique (quiz_id, staff_id)
);

-- Only the service role (the API) reads or writes these tables.
alter table public.assessment_staff enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.assessment_quizzes enable row level security;
alter table public.assessment_attempts enable row level security;
-- Belt and braces: the browser roles get no table privileges at all, so even a
-- mistaken future policy cannot expose staff codes or answers.
revoke all on public.assessment_staff, public.assessment_sessions, public.assessment_quizzes, public.assessment_attempts from anon, authenticated;
