alter table public.labels
  add column if not exists ema_active_text text null;

alter table public.labels
  add column if not exists ema_active_color text null;
