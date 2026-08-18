create table if not exists family (
  id serial primary key,
  code_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists player (
  id serial primary key,
  family_id int not null references family(id),
  coins int not null default 0,
  streak int not null default 0,
  last_play_date date,
  current_stage text not null default 'w1-1',
  owned_items text[] not null default '{}',
  equipped jsonb not null default '{}'::jsonb,
  defeated_bosses int[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists progress (
  player_id int not null references player(id),
  stage_id text not null,
  stars int not null default 1,
  cleared_at timestamptz not null default now(),
  primary key (player_id, stage_id)
);

create table if not exists mistakes (
  id serial primary key,
  player_id int not null references player(id),
  problem jsonb not null,
  wrong_answer text not null,
  correct_streak int not null default 0,
  graduated boolean not null default false,
  created_at timestamptz not null default now()
);
