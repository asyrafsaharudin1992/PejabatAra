-- The CPO can mark an invoice paid (or unpaid) in AraOffice. This is kept apart from Plato's own Paid flag so a re-import of Plato never overwrites it.
-- paid_manual null = follow Plato; true / false = the CPO's decision.
alter table public.proc_orders add column if not exists paid_manual boolean;
alter table public.proc_orders add column if not exists paid_on date;
alter table public.proc_orders add column if not exists paid_note text not null default '';
alter table public.proc_orders add column if not exists paid_by text not null default '';

-- The CPO can also set the due date of an invoice (Plato often leaves it empty on new orders). Kept apart from Plato's due_date; null = follow Plato.
alter table public.proc_orders add column if not exists due_manual date;
