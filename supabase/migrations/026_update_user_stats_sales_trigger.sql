-- 026_update_user_stats_sales_trigger.sql
-- Trigger para atualizar automaticamente o total_sales e total_purchases
-- baseado nas mudanças de status dos pedidos.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_user_stats_sales()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status mudou para um status "pago" ou em andamento e antes não estava nesses status
  IF (NEW.status IN ('paid', 'in_delivery', 'delivered', 'completed', 'disputed') 
      AND (OLD.status IS NULL OR OLD.status NOT IN ('paid', 'in_delivery', 'delivered', 'completed', 'disputed'))) THEN
    
    -- Incrementar total_sales do seller
    UPDATE public.user_stats
       SET total_sales = total_sales + 1
     WHERE user_id = NEW.seller_id;
     
    -- Incrementar total_purchases do buyer
    UPDATE public.user_stats
       SET total_purchases = total_purchases + 1
     WHERE user_id = NEW.buyer_id;
     
  -- Se o status mudou para cancelado ou reembolsado
  ELSIF (NEW.status IN ('refunded', 'cancelled') 
         AND OLD.status IN ('paid', 'in_delivery', 'delivered', 'completed', 'disputed')) THEN
         
    -- Decrementar
    UPDATE public.user_stats
       SET total_sales = GREATEST(0, total_sales - 1)
     WHERE user_id = NEW.seller_id;
     
    UPDATE public.user_stats
       SET total_purchases = GREATEST(0, total_purchases - 1)
     WHERE user_id = NEW.buyer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_orders_update_user_stats ON public.orders;
CREATE TRIGGER trg_orders_update_user_stats
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_user_stats_sales();

COMMIT;
