-- Cerebras free tier as a third AI provider (fallback after Groq and Gemini). The key is CEREBRAS_API_KEY,
-- the model can be changed with CEREBRAS_MODEL; without the key the provider is simply not used.

alter table public.ai_provider_health drop constraint if exists ai_provider_health_provider_check;
alter table public.ai_provider_health
  add constraint ai_provider_health_provider_check check (provider in ('gemini', 'groq', 'cerebras'));

insert into public.ai_provider_health (provider, model)
values ('cerebras', 'gpt-oss-120b')
on conflict (provider) do nothing;
