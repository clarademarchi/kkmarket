CREATE OR REPLACE FUNCTION public.release_seller_balance(
  p_order_id uuid
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH locked_tx AS (
    SELECT user_id, amount
      FROM wallet_transactions
     WHERE reference_id = p_order_id
       AND type = 'order_revenue'
     LIMIT 1
  ),
  update_balance AS (
    UPDATE user_stats
       SET wallet_balance = wallet_balance + (SELECT amount FROM locked_tx),
           updated_at = now()
     WHERE user_id = (SELECT user_id FROM locked_tx)
    RETURNING wallet_balance, user_id
  )
  UPDATE wallet_transactions
     SET balance_after = (SELECT wallet_balance FROM update_balance)
   WHERE reference_id = p_order_id
     AND type = 'order_revenue'
     AND user_id = (SELECT user_id FROM update_balance);
$$;
