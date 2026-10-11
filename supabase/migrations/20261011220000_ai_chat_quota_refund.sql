-- Returns one chat message to the quota when the model gave no answer (provider failure or a stream
-- that broke before any text), so failed attempts and automatic retries do not use up the limit.
create or replace function public.refund_ai_chat_message(p_user_id uuid, p_capability text default 'chat.general')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  update public.ai_usage_daily
  set message_count = greatest(message_count - 1, 0), updated_at = now()
  where user_id = p_user_id and capability = p_capability and period_day = v_day;
  update public.ai_usage_monthly
  set message_count = greatest(message_count - 1, 0), updated_at = now()
  where user_id = p_user_id and capability = p_capability and period_month = v_month;
end;
$$;

revoke all on function public.refund_ai_chat_message(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_ai_chat_message(uuid, text) to service_role;
