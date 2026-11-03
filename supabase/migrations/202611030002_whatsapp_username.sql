-- A few staff can only be reached on WhatsApp by their username, not their phone number: Contact staf opens wa.me/<username> for them.
alter table public.hr_employees add column if not exists whatsapp_username text not null default '';
