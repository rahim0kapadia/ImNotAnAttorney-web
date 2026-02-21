-- ImNotAnAttorney Database Schema
-- Run this in Supabase SQL Editor to create tables

-- Subscribers (email list — replaces data/subscribers.json)
create table if not exists subscribers (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  source text not null default 'lead-capture',
  unsubscribed_at timestamptz, -- CAN-SPAM: tracks when user unsubscribed
  created_at timestamptz default now() not null
);

-- Migration for existing databases:
-- ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

-- Intakes (case submissions — replaces data/intakes.json)
create table if not exists intakes (
  id uuid default gen_random_uuid() primary key,
  first_name text not null,
  last_name text,
  email text not null,
  phone text,
  charge_type text not null,
  state text,
  has_attorney text,
  has_discovery text,
  services text[], -- array of selected service interests
  situation text,
  created_at timestamptz default now() not null
);

-- Orders (payment records)
create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  tier text not null, -- case-decoder, intelligence-brief, x-ray, war-room, situation-room
  amount integer not null, -- cents
  status text not null default 'pending', -- pending, paid, refunded
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  upgrade_credit_applied integer default 0, -- cents credited from prior purchase
  created_at timestamptz default now() not null,
  paid_at timestamptz
);

-- Cases (active cases linked to paid orders)
create table if not exists cases (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references orders(id) not null,
  email text not null,
  tier text not null,
  status text not null default 'intake', -- intake, in-progress, review, delivered
  intake_id uuid references intakes(id),
  file_urls text[], -- discovery document URLs in Supabase Storage
  deliverable_url text, -- URL to final report
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index if not exists idx_orders_email on orders(email);
create index if not exists idx_orders_stripe_session on orders(stripe_session_id);
create index if not exists idx_cases_email on cases(email);
create index if not exists idx_cases_order on cases(order_id);
create index if not exists idx_intakes_email on intakes(email);

-- Row Level Security (enable for all tables)
alter table subscribers enable row level security;
alter table intakes enable row level security;
alter table orders enable row level security;
alter table cases enable row level security;

-- RLS policies: service role can do everything, anon can only insert
-- Subscribers: anon can insert (sign up for email list)
create policy "Anon can subscribe" on subscribers
  for insert to anon with check (true);

-- Intakes: anon can insert (submit case info)
create policy "Anon can submit intake" on intakes
  for insert to anon with check (true);

-- Orders/Cases: service role only (webhooks handle creation)
-- No anon access needed — Stripe webhook creates orders via admin client

-- Storage bucket for discovery files
-- Run separately: insert into storage.buckets (id, name, public) values ('discovery-files', 'discovery-files', false);
