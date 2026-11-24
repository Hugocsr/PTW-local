-- Small public brand assets are independent from confidential PT attachments.
create table ptw.appearance_asset (
  unit_id uuid not null references ptw.unit(id),
  id uuid not null default uuidv7(),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  content bytea not null check (octet_length(content) between 45 and 262144),
  size integer generated always as (octet_length(content)) stored,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (unit_id, id),
  unique (unit_id, hash),
  foreign key (unit_id, created_by) references ptw.person(unit_id, id),
  check (hash = encode(sha256(content), 'hex')),
  check (substring(content from 1 for 8) = decode('89504e470d0a1a0a', 'hex'))
);

create table ptw.appearance (
  unit_id uuid primary key references ptw.unit(id),
  brand jsonb check (brand is null or (jsonb_typeof(brand) = 'object'
    and jsonb_typeof(brand -> 'colors') = 'object'
    and length(brand ->> 'name') between 1 and 40
    and length(brand ->> 'mark') between 1 and 3)),
  revision integer not null check (revision >= 1),
  updated_by uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (unit_id, updated_by) references ptw.person(unit_id, id)
);

create function ptw.appearance_guard() returns trigger
  language plpgsql set search_path = ptw, pg_catalog as $$
declare f text;
begin
  if ptw.current_person() is null then raise insufficient_privilege using message = 'Configuração exige pessoa autenticada'; end if;
  if tg_table_name = 'appearance_asset' then
    new.created_by := ptw.current_person();
    new.created_at := clock_timestamp();
    return new;
  end if;
  if tg_op = 'INSERT' then new.revision := 1;
  else new.revision := old.revision + 1; end if;
  new.updated_by := ptw.current_person();
  new.updated_at := clock_timestamp();
  foreach f in array array[new.brand ->> 'logo', new.brand ->> 'symbol'] loop
    if f ~ '^[0-9a-f]{64}\.png$' and not exists (
      select 1 from ptw.appearance_asset a where a.unit_id = new.unit_id and a.hash = left(f, 64)
    ) then raise foreign_key_violation using message = 'Imagem da identidade não existe nesta unidade'; end if;
  end loop;
  return new;
end $$;

create trigger appearance_guard before insert or update on ptw.appearance
  for each row execute function ptw.appearance_guard();
create trigger appearance_guard before insert on ptw.appearance_asset
  for each row execute function ptw.appearance_guard();
