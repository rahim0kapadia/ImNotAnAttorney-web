-- Drip email tracking table
-- Tracks which emails have been sent to which subscribers to prevent duplicates.
-- Run this in Supabase SQL Editor after deployment.

create table if not exists drip_emails (
  id uuid default gen_random_uuid() primary key,
  subscriber_id uuid references subscribers(id) not null,
  email_key text not null,
  sent_at timestamptz default now(),
  unique(subscriber_id, email_key)
);

-- Index for cron query performance
create index if not exists idx_drip_emails_subscriber_id on drip_emails(subscriber_id);
create index if not exists idx_drip_emails_email_key on drip_emails(email_key);
