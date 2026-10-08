-- Adds 'benefits_image': the storage path of the TeamAra benefits picture sent after the card.
alter table public.teamara_messages drop constraint if exists teamara_messages_key_check;
alter table public.teamara_messages add constraint teamara_messages_key_check check (key in ('card', 'birthday', 'card_template', 'benefits_image'));
