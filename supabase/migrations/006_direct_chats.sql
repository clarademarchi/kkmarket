-- 006_direct_chats.sql
-- Tabela para chats diretos entre usuários

BEGIN;

CREATE TABLE IF NOT EXISTS public.direct_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant2_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_chats_participants_differ CHECK (participant1_id != participant2_id),
  CONSTRAINT direct_chats_unique_pair UNIQUE (participant1_id, participant2_id)
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.direct_chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS para direct_chats
ALTER TABLE public.direct_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participantes podem ver seus chats"
  ON public.direct_chats FOR SELECT
  USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);

CREATE POLICY "Participantes podem atualizar seus chats"
  ON public.direct_chats FOR UPDATE
  USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- RLS para direct_messages
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participantes podem ver mensagens de seus chats"
  ON public.direct_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.direct_chats
      WHERE id = direct_messages.chat_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  );

CREATE POLICY "Participantes podem inserir mensagens em seus chats"
  ON public.direct_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.direct_chats
      WHERE id = direct_messages.chat_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  );

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

COMMIT;
