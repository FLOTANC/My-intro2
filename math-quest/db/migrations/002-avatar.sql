-- アバター機能: 所持アイテムと装備状態を player に追加する（既存データは保持）
alter table player add column if not exists owned_items text[] not null default '{}';
alter table player add column if not exists equipped jsonb not null default '{}'::jsonb;
