-- Adds 'birthday_poster': the storage path of the poster copied before the birthday WhatsApp message.
alter table public.teamara_messages drop constraint if exists teamara_messages_key_check;
alter table public.teamara_messages add constraint teamara_messages_key_check check (key in ('card', 'birthday', 'card_template', 'benefits_image', 'birthday_poster'));
