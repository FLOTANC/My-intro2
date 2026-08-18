alter table player add column if not exists defeated_bosses int[] not null default '{}';
