-- Cadastro: unidade, tipos, locais (árvore ltree), ativos e o fecho de "parte de", pessoas e cargos,
-- listas de opções.
-- Toda tabela de unidade tem a chave (unit_id, id): as chaves estrangeiras compostas impedem
-- referência entre unidades, e o isolamento por unidade (RLS) usa o começo do índice.
set search_path = ptw, public;

create table ptw.unit (
  id        uuid primary key default uuidv7(),
  code      text not null unique check (code ~ '^[A-Z0-9-]{2,16}$'),
  name      text not null check (length(name) between 1 and 200),
  -- Fuso da planta: define o "dia" de validade de cargos, contas, datas e documentos.
  timezone  text not null default 'America/Sao_Paulo'
);

-- Tipos configuráveis (Configuração › Tipos). system_key marca os que o produto usa por regra:
-- a relação 'parte_de' define a trava de equipamento.
create table ptw.type_def (
  unit_id    uuid not null references ptw.unit,
  id         uuid not null default uuidv7(),
  family     ptw.type_family not null,
  label      text not null check (length(label) between 1 and 80),
  icon       text check (icon ~ '^[a-z0-9_]{1,40}$'),
  system_key text check (system_key ~ '^[a-z_]{1,40}$'),
  active     boolean not null default true,
  primary key (unit_id, id),
  -- Alvo das chaves compostas (unit_id, tipo, família): um local só aponta para tipo de local etc.
  unique (unit_id, id, family),
  check (icon is null or family in ('local', 'ativo'))
);
create unique index type_def_label_uq  on ptw.type_def (unit_id, family, lower(label));
create unique index type_def_system_uq on ptw.type_def (unit_id, family, system_key) where system_key is not null;
-- Tipo do sistema (system_key) não sai e a chave não muda (nem é dada depois da criação): a regra
-- que depende dele (ex.: "parte de" na trava de equipamento) não pode ficar sem o tipo (23514).
create function ptw.type_def_system_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.system_key is not null then
    raise exception 'Tipo do sistema não pode ser removido' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.system_key is distinct from old.system_key then
    raise exception 'A chave do sistema do tipo não muda' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger type_def_system_guard before update or delete on ptw.type_def
  for each row execute function ptw.type_def_system_guard();

-- Atributos de ficha (local e ativo): um objeto JSON de até 8 KiB. As chaves e os formatos são da tela
-- (core/assetAttrs.ts); o banco só garante que é um objeto pequeno.
create function ptw.attrs_ok(a jsonb) returns boolean
  language sql immutable parallel safe
  return jsonb_typeof(a) = 'object' and octet_length(a::text) <= 8192;

-- ---------- Locais: árvore estrita ----------
create table ptw.location (
  unit_id    uuid not null references ptw.unit,
  id         uuid not null default uuidv7(),
  parent_id  uuid,
  type_id    uuid not null,
  type_fam   ptw.type_family not null default 'local' check (type_fam = 'local'),
  code       text not null check (length(code) between 1 and 64),
  name       text not null check (length(name) between 1 and 200),
  aliases    text[] not null default '{}',
  -- Dados de integração e de ficha (SGI Forces): planta (fuso, WERKS, IWERK, BUKRS, REGIO) e área
  -- (TPLNR, BEBER, KOSTL). Objeto de textos curtos; a tela conhece as chaves, o banco só limita.
  attrs      jsonb not null default '{}'::jsonb check (ptw.attrs_ok(attrs)),
  origin     ptw.record_origin not null default 'manual',
  status     ptw.record_status not null default 'ativo',
  -- Caminho de ids da raiz até o local, mantido pelos gatilhos abaixo.
  path       ltree not null,
  search     text generated always as (ptw.search_text(variadic array[code, name, attrs->>'tplnr', attrs->>'werks'] || aliases)) stored,
  revision   integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (unit_id, id),
  foreign key (unit_id, parent_id) references ptw.location (unit_id, id),
  foreign key (unit_id, type_id, type_fam) references ptw.type_def (unit_id, id, family),
  check (parent_id is distinct from id)
);
create unique index location_code_uq on ptw.location (unit_id, lower(code));
create index location_parent_ix on ptw.location (unit_id, parent_id);
create index location_path_gist on ptw.location using gist (path);
create index location_search_trgm on ptw.location using gin (search gin_trgm_ops);

-- Caminho do local; recusa pôr um local dentro de si mesmo (direta ou indiretamente).
create function ptw.location_path() returns trigger language plpgsql as $$
declare parent_path ltree;
begin
  if new.parent_id is null then
    new.path := text2ltree(replace(new.id::text, '-', ''));
  else
    select path into parent_path from ptw.location where unit_id = new.unit_id and id = new.parent_id;
    if parent_path ~ ('*.' || replace(new.id::text, '-', '') || '.*')::lquery then
      raise exception 'Um local não pode ficar dentro de si mesmo' using errcode = 'PTW02';
    end if;
    new.path := parent_path || text2ltree(replace(new.id::text, '-', ''));
  end if;
  return new;
end $$;
create trigger location_path_ins before insert on ptw.location
  for each row execute function ptw.location_path();
create trigger location_path_upd before update of parent_id on ptw.location
  for each row when (old.parent_id is distinct from new.parent_id) execute function ptw.location_path();

-- Ao mover um local, o caminho dos descendentes acompanha (operação rara; uma instrução).
create function ptw.location_move_subtree() returns trigger language plpgsql as $$
begin
  update ptw.location d
     set path = new.path || subpath(d.path, nlevel(old.path))
   where d.unit_id = new.unit_id and d.path <@ old.path and d.id <> new.id;
  return null;
end $$;
create trigger location_move after update of parent_id on ptw.location
  for each row when (old.path::text is distinct from new.path::text) execute function ptw.location_move_subtree();
create trigger location_rev before update on ptw.location
  for each row execute function ptw.bump_revision();

-- ---------- Ativos ----------
create table ptw.asset (
  unit_id    uuid not null references ptw.unit,
  id         uuid not null default uuidv7(),
  type_id    uuid not null,
  type_fam   ptw.type_family not null default 'ativo' check (type_fam = 'ativo'),
  code       text not null check (length(code) between 1 and 64),
  name       text not null check (length(name) between 1 and 200),
  aliases    text[] not null default '{}',
  -- Ficha do equipamento (SGI Forces): EQUNR, fabricante, modelo, série, status operacional, dados SAP
  -- e o bloco "dispositivo de proteção" (protecao: tipo, princípio, bypass, sistema, classe, protegidos).
  attrs      jsonb not null default '{}'::jsonb check (ptw.attrs_ok(attrs)),
  origin     ptw.record_origin not null default 'manual',
  status     ptw.record_status not null default 'ativo',
  search     text generated always as (ptw.search_text(variadic array[code, name, attrs->>'equnr', attrs->>'tplnr'] || aliases)) stored,
  revision   integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (unit_id, id),
  foreign key (unit_id, type_id, type_fam) references ptw.type_def (unit_id, id, family)
);
create unique index asset_code_uq on ptw.asset (unit_id, lower(code));
create index asset_search_trgm on ptw.asset using gin (search gin_trgm_ops);
create trigger asset_rev before update on ptw.asset
  for each row execute function ptw.bump_revision();

-- Onde o ativo está (um ativo pode estar em mais de um local).
create table ptw.asset_location (
  unit_id     uuid not null,
  asset_id    uuid not null,
  location_id uuid not null,
  primary key (unit_id, asset_id, location_id),
  foreign key (unit_id, asset_id) references ptw.asset (unit_id, id) on delete cascade,
  foreign key (unit_id, location_id) references ptw.location (unit_id, id)
);
create index asset_location_loc_ix on ptw.asset_location (unit_id, location_id);

-- Relações entre ativos (alimenta, isola, abastece, parte de…): from_id <relação> to_id.
-- Em "parte de", from_id é parte de to_id (to_id é o ancestral).
create table ptw.asset_relation (
  unit_id  uuid not null,
  id       uuid not null default uuidv7(),
  from_id  uuid not null,
  to_id    uuid not null,
  kind_id  uuid not null,
  kind_fam ptw.type_family not null default 'relacao' check (kind_fam = 'relacao'),
  primary key (unit_id, id),
  unique (unit_id, from_id, to_id, kind_id),
  foreign key (unit_id, from_id) references ptw.asset (unit_id, id) on delete cascade,
  foreign key (unit_id, to_id) references ptw.asset (unit_id, id) on delete cascade,
  foreign key (unit_id, kind_id, kind_fam) references ptw.type_def (unit_id, id, family),
  check (from_id <> to_id)
);
create index asset_relation_to_ix on ptw.asset_relation (unit_id, to_id);

-- Fecho transitivo de "parte de" (grafo acíclico). Linha (a, d): d é parte de a, em qualquer nível;
-- inclui (x, x). paths conta os caminhos, para remover uma aresta sem recalcular tudo.
-- Com ele, "esses dois ativos colidem?" é uma busca em índice, sem recursão. Só os gatilhos gravam.
create table ptw.asset_part (
  unit_id       uuid not null,
  ancestor_id   uuid not null,
  descendant_id uuid not null,
  paths         integer not null check (paths >= 0),
  primary key (unit_id, ancestor_id, descendant_id),
  foreign key (unit_id, ancestor_id) references ptw.asset (unit_id, id) on delete cascade,
  foreign key (unit_id, descendant_id) references ptw.asset (unit_id, id) on delete cascade
);
create index asset_part_desc_ix on ptw.asset_part (unit_id, descendant_id, ancestor_id);

-- Os gatilhos do fecho rodam como o dono: a API lê asset_part, mas não grava.
create function ptw.asset_self_part() returns trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
begin
  insert into ptw.asset_part values (new.unit_id, new.id, new.id, 1);
  return null;
end $$;
create trigger asset_self_part after insert on ptw.asset
  for each row execute function ptw.asset_self_part();

create function ptw.is_part_of(p_unit uuid, p_kind uuid) returns boolean
  language sql stable parallel safe
  return exists (select 1 from ptw.type_def
                 where unit_id = p_unit and id = p_kind and family = 'relacao' and system_key = 'parte_de');

-- "Parte de": mantém o fecho e recusa a relação que criaria ciclo (PTW11) ou juntaria duas PTs
-- abertas no mesmo equipamento (PTW10). Relação não se altera: remove e cria.
create function ptw.asset_relation_part() returns trigger
  language plpgsql security definer set search_path = ptw, pg_catalog as $$
declare hit record;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Remova e crie a relação em vez de alterar' using errcode = 'PTW04';
  end if;
  if tg_op = 'INSERT' then
    if not ptw.is_part_of(new.unit_id, new.kind_id) then return null; end if;
    if exists (select 1 from ptw.asset_part
               where unit_id = new.unit_id and ancestor_id = new.from_id and descendant_id = new.to_id) then
      raise exception 'A relação criaria um ciclo em "parte de"' using errcode = 'PTW11';
    end if;
    -- Trava, em ordem de id, os ativos que passam a colidir (mesma ordem da trava de equipamento).
    perform 1 from ptw.asset where unit_id = new.unit_id and id in (
        select ancestor_id from ptw.asset_part where unit_id = new.unit_id and descendant_id = new.to_id
        union select descendant_id from ptw.asset_part where unit_id = new.unit_id and ancestor_id = new.from_id)
      order by id for no key update;
    select p1.number n1, p2.number n2 into hit
      from ptw.asset_part a
      join ptw.permit_asset h1 on h1.unit_id = a.unit_id and h1.asset_id = a.ancestor_id and h1.holds
      join ptw.asset_part d on d.unit_id = a.unit_id and d.ancestor_id = new.from_id
      join ptw.permit_asset h2 on h2.unit_id = d.unit_id and h2.asset_id = d.descendant_id and h2.holds
      join ptw.permit p1 on p1.unit_id = h1.unit_id and p1.id = h1.permit_id
      join ptw.permit p2 on p2.unit_id = h2.unit_id and p2.id = h2.permit_id
     where a.unit_id = new.unit_id and a.descendant_id = new.to_id and h1.permit_id <> h2.permit_id
     limit 1;
    if found then
      raise exception 'A relação juntaria duas PTs abertas no mesmo equipamento (% e %)', hit.n1, hit.n2
        using errcode = 'PTW10', hint = 'equipamento_ocupado';
    end if;
    insert into ptw.asset_part (unit_id, ancestor_id, descendant_id, paths)
    select new.unit_id, a.ancestor_id, d.descendant_id, a.paths * d.paths
      from ptw.asset_part a, ptw.asset_part d
     where a.unit_id = new.unit_id and a.descendant_id = new.to_id
       and d.unit_id = new.unit_id and d.ancestor_id = new.from_id
    on conflict (unit_id, ancestor_id, descendant_id)
      do update set paths = ptw.asset_part.paths + excluded.paths;
    return null;
  end if;
  -- Remoção: desconta os caminhos que passavam pela aresta.
  if not ptw.is_part_of(old.unit_id, old.kind_id) then return null; end if;
  update ptw.asset_part p set paths = p.paths - x.n
    from (select a.ancestor_id, d.descendant_id, a.paths * d.paths as n
            from ptw.asset_part a, ptw.asset_part d
           where a.unit_id = old.unit_id and a.descendant_id = old.to_id
             and d.unit_id = old.unit_id and d.ancestor_id = old.from_id) x
   where p.unit_id = old.unit_id and p.ancestor_id = x.ancestor_id and p.descendant_id = x.descendant_id;
  delete from ptw.asset_part where unit_id = old.unit_id and paths <= 0;
  return null;
end $$;
create trigger asset_relation_part after insert or update or delete on ptw.asset_relation
  for each row execute function ptw.asset_relation_part();

-- ---------- Pessoas e cargos ----------
create table ptw.person (
  unit_id         uuid not null references ptw.unit,
  id              uuid not null default uuidv7(),
  name            text not null check (length(name) between 1 and 200),
  company         text not null default '' check (length(company) <= 200),
  employee_id     text not null default '' check (length(employee_id) <= 64),
  -- Sem login = contato: identidade apenas, não assina.
  login           text check (login ~ '^[A-Za-z0-9._@-]{1,104}$'),
  enabled         boolean not null default true,
  account_expires timestamptz,
  ad_object_guid  uuid,
  origin          ptw.record_origin not null default 'manual',
  status          ptw.record_status not null default 'ativo',
  search          text generated always as (ptw.search_text(name, company, employee_id, login)) stored,
  revision        integer not null default 1,
  updated_at      timestamptz not null default now(),
  primary key (unit_id, id)
);
create unique index person_login_uq on ptw.person (unit_id, lower(login)) where login is not null;
create unique index person_ad_uq    on ptw.person (unit_id, ad_object_guid) where ad_object_guid is not null;
create index person_search_trgm on ptw.person using gin (search gin_trgm_ops);
create trigger person_rev before update on ptw.person
  for each row execute function ptw.bump_revision();

-- Cargo da pessoa, com escopo (o local e tudo abaixo dele; nulo = unidade inteira) e validade
-- (último dia válido, no fuso da planta).
create table ptw.person_role (
  unit_id           uuid not null,
  id                uuid not null default uuidv7(),
  person_id         uuid not null,
  role_id           uuid not null,
  role_fam          ptw.type_family not null default 'cargo' check (role_fam = 'cargo'),
  scope_location_id uuid,
  valid_until       date not null,
  primary key (unit_id, id),
  unique nulls not distinct (unit_id, person_id, role_id, scope_location_id),
  foreign key (unit_id, person_id) references ptw.person (unit_id, id) on delete cascade,
  foreign key (unit_id, role_id, role_fam) references ptw.type_def (unit_id, id, family),
  foreign key (unit_id, scope_location_id) references ptw.location (unit_id, id)
);
create index person_role_role_ix on ptw.person_role (unit_id, role_id, valid_until);

-- Motivo de a pessoa não ser elegível hoje (nulo = elegível): cadastro ativo; conta ativa e no
-- prazo, se tiver login (login não é exigido aqui: vigia pode ser contato); com p_role, o cargo
-- válido hoje e com escopo que cubra o local (loc).
create function ptw.person_ineligible(p_unit uuid, p_person uuid, p_role uuid, today date, loc ltree) returns text
  language plpgsql stable as $$
declare who record;
begin
  select pe.login, pe.enabled, pe.account_expires, pe.status into who from ptw.person pe
   where pe.unit_id = p_unit and pe.id = p_person;
  if not found then return 'pessoa inexistente'; end if;
  if who.status = 'inativo' then return 'cadastro inativo'; end if;
  if who.status = 'em_revisao' then return 'cadastro em revisão'; end if;
  if who.login is not null and not who.enabled then return 'conta desativada'; end if;
  if who.login is not null and who.account_expires <= now() then return 'conta vencida'; end if;
  if p_role is not null and not exists (
      select 1 from ptw.person_role pr left join ptw.location sc on sc.unit_id = pr.unit_id and sc.id = pr.scope_location_id
       where pr.unit_id = p_unit and pr.person_id = p_person and pr.role_id = p_role
         and pr.valid_until >= today and (pr.scope_location_id is null or sc.path @> loc)) then
    return 'cargo vencido ou fora do escopo do local';
  end if;
  return null;
end $$;

-- Assinatura aceita por vários cargos: elegível com QUALQUER um deles (nulo = elegível). Sem cargo
-- (assinatura da pessoa indicada), só o cadastro e a conta. O motivo devolvido é o do último cargo.
create function ptw.person_ineligible_any(p_unit uuid, p_person uuid, p_roles uuid[], today date, loc ltree) returns text
  language plpgsql stable as $$
declare why text; r uuid;
begin
  if coalesce(cardinality(p_roles), 0) = 0 then return ptw.person_ineligible(p_unit, p_person, null, today, loc); end if;
  foreach r in array p_roles loop
    why := ptw.person_ineligible(p_unit, p_person, r, today, loc);
    if why is null then return null; end if;
  end loop;
  return why;
end $$;

-- Elegível agora? O mesmo que person_ineligible_any(...) is null (com p_login, exige também o login,
-- como para assinar), em SQL puro: serve a listas (quem move a seguir no Quadro) sem uma chamada por
-- pessoa e por cargo. As duas são conferidas uma contra a outra em db/tests/invariants.sql.
create function ptw.person_ok(p_unit uuid, p_person uuid, p_roles uuid[], today date, loc ltree, p_login boolean) returns boolean
  language sql stable parallel safe
  return exists (
    select 1 from ptw.person pe
     where pe.unit_id = p_unit and pe.id = p_person and pe.status = 'ativo'
       and (pe.login is not null or not p_login)
       and (pe.login is null or (pe.enabled and (pe.account_expires is null or pe.account_expires > now())))
       and (coalesce(cardinality(p_roles), 0) = 0 or exists (
              select 1 from ptw.person_role pr
                left join ptw.location sc on sc.unit_id = pr.unit_id and sc.id = pr.scope_location_id
               where pr.unit_id = p_unit and pr.person_id = p_person and pr.role_id = any (p_roles)
                 and pr.valid_until >= today and (pr.scope_location_id is null or sc.path @> loc))));

-- ---------- Listas de opções ----------
create table ptw.option_list (
  unit_id    uuid not null references ptw.unit,
  id         uuid not null default uuidv7(),
  name       text not null check (length(name) between 1 and 120),
  revision   integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (unit_id, id)
);
create unique index option_list_name_uq on ptw.option_list (unit_id, lower(name));
create trigger option_list_rev before update on ptw.option_list
  for each row execute function ptw.bump_revision();

-- Item nunca muda de id; inativo = não é mais oferecido, mas respostas antigas continuam legíveis.
create table ptw.option_item (
  unit_id  uuid not null,
  id       uuid not null default uuidv7(),
  list_id  uuid not null,
  label    text not null check (length(label) between 1 and 200),
  active   boolean not null default true,
  position integer not null check (position >= 0),
  primary key (unit_id, id),
  foreign key (unit_id, list_id) references ptw.option_list (unit_id, id) on delete cascade
);
create index option_item_list_ix on ptw.option_item (unit_id, list_id, position);
