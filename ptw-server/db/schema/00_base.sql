-- Base: extensões, schema, tipos, contexto da sessão e funções de apoio sem tabela.
-- PostgreSQL 18. Todo objeto vive no schema "ptw". Os arquivos de db/schema são aplicados em
-- ordem, numa transação só, sobre um banco vazio.

create extension if not exists pg_trgm;     -- busca por trecho (código, nome, apelidos)
create extension if not exists ltree;       -- árvore de locais: ancestral/descendente em índice GiST
create extension if not exists unaccent;    -- busca sem acento

create schema ptw;
set search_path = ptw, public;

-- ---------- Tipos ----------
create type ptw.record_origin  as enum ('manual', 'csv', 'sugerida', 'ad');
create type ptw.record_status  as enum ('ativo', 'em_revisao', 'inativo');
create type ptw.type_family    as enum ('local', 'ativo', 'cargo', 'relacao', 'trabalho');
create type ptw.version_status as enum ('rascunho', 'ativa', 'arquivada');
create type ptw.version_origin as enum ('manual', 'sugerida');
create type ptw.stage_kind     as enum ('solicitacao', 'emissao', 'aceite_campo', 'entrega', 'aceite_area');
create type ptw.slot_kind      as enum ('cargo', 'pessoa');
create type ptw.permit_state   as enum ('rascunho', 'em_analise', 'devolvida', 'emitida', 'ativa',
                                        'suspensa', 'entregue', 'encerrada', 'cancelada', 'expirada');
create type ptw.attach_kind    as enum ('foto', 'video', 'arquivo');
-- Como a pessoa se identificou na sessão que agiu (entra em todo evento de auditoria).
create type ptw.auth_method    as enum ('senha', 'ldap', 'pin', 'sessao', 'emergencia', 'servico', 'sistema');

-- ---------- Contexto da transação ----------
-- A API abre toda transação com ptw.set_context(...) (50_auditoria), que grava estes valores com
-- set_config(..., true): valem só para a transação, seguro com pool em modo transaction.
create function ptw.ctx(p text) returns text
  language sql stable parallel safe
  return nullif(current_setting('ptw.' || p, true), '');

create function ptw.current_unit() returns uuid
  language sql stable parallel safe
  return ptw.ctx('unit_id')::uuid;

create function ptw.current_person() returns uuid
  language sql stable parallel safe
  return ptw.ctx('person_id')::uuid;

-- ---------- Texto ----------
-- unaccent() é STABLE; com o dicionário fixo, o invólucro é IMMUTABLE e pode ir em coluna gerada.
create function ptw.f_unaccent(text) returns text
  language sql immutable parallel safe strict
  return public.unaccent('public.unaccent'::regdictionary, $1);

-- Texto de busca: minúsculo e sem acento, para índice trigram.
create function ptw.search_text(variadic parts text[]) returns text
  language sql immutable parallel safe
  return lower(ptw.f_unaccent(coalesce(array_to_string(parts, ' '), '')));

create function ptw.is_uuid(t text) returns boolean
  language sql immutable parallel safe
  return t ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Data ISO completa "AAAA-MM-DD"; nulo se incompleta, em outro formato ou inexistente (30/02).
create function ptw.iso_date(t text) returns date
  language plpgsql immutable parallel safe as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return make_date(substr(t, 1, 4)::int, substr(t, 6, 2)::int, substr(t, 9, 2)::int);
exception when others then
  return null;
end $$;

-- Código no formato do documento: "#" dígito, "A" letra, o resto literal; sem diferença de caixa.
-- Formato vazio aceita qualquer código.
create function ptw.code_matches(code text, pattern text) returns boolean
  language sql immutable parallel safe
  return coalesce(btrim(pattern), '') = '' or (
    length(btrim(code)) = length(btrim(pattern)) and not exists (
      select 1 from generate_series(1, length(btrim(pattern))) g
       where not case substr(btrim(pattern), g, 1)
                   when '#' then substr(upper(btrim(code)), g, 1) ~ '^[0-9]$'
                   when 'A' then substr(upper(btrim(code)), g, 1) ~ '^[A-Z]$'
                   else substr(upper(btrim(code)), g, 1) = upper(substr(btrim(pattern), g, 1)) end));

-- Campo JSON opcional com o tipo certo ("number?" aceita também null).
create function ptw.jopt(j jsonb, k text, typ text) returns boolean
  language sql immutable parallel safe
  return not (j ? k) or jsonb_typeof(j -> k) = typ or (typ = 'number?' and jsonb_typeof(j -> k) in ('number', 'null'));

-- ---------- Gatilhos genéricos ----------
-- Concorrência otimista dos cadastros: UPDATE ... WHERE id = $1 AND revision = $esperada (0 linhas = conflito).
create function ptw.bump_revision() returns trigger language plpgsql as $$
begin
  new.revision   := old.revision + 1;
  new.updated_at := now();
  return new;
end $$;

-- Registro somente inclusão: qualquer UPDATE, DELETE ou TRUNCATE é recusado.
create function ptw.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% é somente inclusão', tg_table_name using errcode = 'PTW01';
end $$;
