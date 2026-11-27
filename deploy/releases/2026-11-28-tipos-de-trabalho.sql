-- Publicação 28/11/2026: Tipos de trabalho (SPEC 012). Catálogo novo (família "trabalho") e tabela de escopo da versão.
-- Atualização para um banco que já roda a publicação de 26/11/2026 (2026-11-26-delegacoes-edicao.sql).
-- Rodar como dono (postgres do Supabase), em DUAS etapas: a primeira não pode estar na mesma transação da segunda
-- (um valor novo de enum só vale depois de confirmado). Não apaga nem altera dados existentes.
--
-- ETAPA 1: valor novo do enum (rode sozinha e confirme).
alter type ptw.type_family add value if not exists 'trabalho';

-- ETAPA 2: rode o restante, numa transação só.
begin;
set local search_path = ptw, public;
set local lock_timeout = '10s';

-- 1) Tipos de trabalho escolhidos por versão (um ou mais). Congelam com a versão ativa, como o resto do Escopo.
create table ptw.version_work_type (
  unit_id    uuid not null,
  version_id uuid not null,
  type_id    uuid not null,
  type_fam   ptw.type_family not null default 'trabalho' check (type_fam = 'trabalho'),
  primary key (unit_id, version_id, type_id),
  foreign key (unit_id, version_id) references ptw.template_version (unit_id, id) on delete cascade,
  foreign key (unit_id, type_id, type_fam) references ptw.type_def (unit_id, id, family)
);
create trigger version_work_type_guard before insert or update or delete on ptw.version_work_type
  for each row execute function ptw.version_child_guard();
create trigger audit_row after insert or update or delete on ptw.version_work_type for each row
  execute function ptw.audit_row('modelo.versao.escopo.incluido', 'modelo.versao.escopo.alterado', 'modelo.versao.escopo.removido', 'Tipo de trabalho', 'version_id');

-- 2) Isolamento por unidade e permissões da API (como as demais tabelas de escopo).
alter table ptw.version_work_type enable row level security;
create policy unit_isolation on ptw.version_work_type using (unit_id = (select ptw.current_unit()))
  with check (unit_id = (select ptw.current_unit()));
grant select on ptw.version_work_type to ptw_app;
grant insert, update, delete on ptw.version_work_type to ptw_app;

-- 3) Catálogo inicial: copia os itens da lista de opções "Tipos de trabalho" (se existir) para o novo catálogo,
--    uma vez por unidade, sem repetir o que já existe. A lista antiga continua, como pergunta de formulário.
do $$
declare u record;
begin
  for u in select distinct l.unit_id from ptw.option_list l where lower(l.name) = 'tipos de trabalho' loop
    perform ptw.set_context(u.unit_id, null, null, 'servico', 'publicacao-2026-11-28', 'tipos-de-trabalho');
    insert into ptw.type_def (unit_id, id, family, label, active)
    select i.unit_id, uuidv7(), 'trabalho', i.label, i.active
      from ptw.option_item i join ptw.option_list l on l.unit_id = i.unit_id and l.id = i.list_id
     where i.unit_id = u.unit_id and lower(l.name) = 'tipos de trabalho'
       and not exists (select 1 from ptw.type_def d where d.unit_id = i.unit_id and d.family = 'trabalho' and lower(d.label) = lower(i.label));
  end loop;
end $$;

commit;
