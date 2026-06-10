-- DEVERSE — Postgres schema (Supabase / Neon / Vercel Postgres).
-- Run this once in your provider's SQL editor (Supabase: SQL Editor → New query).

create table if not exists developers (
  github_id    bigint primary key,
  login        text not null,
  name         text,
  avatar_url   text,
  bio          text,
  html_url     text,
  location_raw text,                 -- the free-text location from GitHub
  city         text,
  country      text,
  lat          double precision,
  lon          double precision,
  langs        jsonb not null default '[]'::jsonb,
  focus        text,
  years        integer default 1,
  repos        integer default 0,
  stars        integer default 0,
  followers    integer default 0,
  status       text default 'offline',  -- online | away | offline
  source       text default 'seed',     -- 'seed' (script) | 'signin' (OAuth)
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  last_seen    timestamptz
);

-- only pins that resolved to coordinates need to be queried by location
create index if not exists developers_located_idx on developers (lat, lon);
create index if not exists developers_country_idx on developers (country);
