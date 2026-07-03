-- 005_enable_realtime.sql
-- Force enable realtime for order_messages and notifications tables

BEGIN;

  -- Ensure publication exists
  DO $$ 
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

  -- Add tables to publication if they are not already in it
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

  -- Ensure replica identity is full or default (default is fine for insert)
  ALTER TABLE public.order_messages REPLICA IDENTITY DEFAULT;
  ALTER TABLE public.notifications REPLICA IDENTITY DEFAULT;

COMMIT;
