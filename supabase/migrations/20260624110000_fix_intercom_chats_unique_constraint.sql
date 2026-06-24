-- Drop unique constraint on user_id alone
ALTER TABLE public.intercom_chats DROP CONSTRAINT IF EXISTS intercom_chats_user_id_key;

-- Add a composite unique constraint on (user_id, channel) to allow one room per channel for the same PMO user
ALTER TABLE public.intercom_chats ADD CONSTRAINT intercom_chats_user_id_channel_key UNIQUE (user_id, channel);
