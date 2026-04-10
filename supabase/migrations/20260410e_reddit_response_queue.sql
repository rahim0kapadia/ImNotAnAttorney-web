-- Reddit Response Pipeline: queue table for monitoring matches + draft responses.
--
-- Stores matched Reddit threads, the template used, the customized draft,
-- and lifecycle status (pending → notified → posted | skipped).

create table reddit_response_queue (
  id uuid primary key default gen_random_uuid(),
  reddit_thread_id text not null unique,
  subreddit text not null,
  thread_title text not null,
  thread_url text not null,
  poster_text text,
  matched_template text not null,
  blog_url text not null,
  draft_response text not null,
  status text not null default 'pending'
    check (status in ('pending', 'notified', 'posted', 'skipped')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  posted_at timestamptz
);

-- Index for cron dedup lookups (most frequent query pattern)
create index idx_reddit_response_queue_thread_id on reddit_response_queue (reddit_thread_id);

-- Index for status-based queries (pending items to notify)
create index idx_reddit_response_queue_status on reddit_response_queue (status) where status = 'pending';

comment on table reddit_response_queue is 'Reddit response pipeline: tracks matched threads, draft responses, and notification status.';
