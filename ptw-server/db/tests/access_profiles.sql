-- Perfis de acesso (SPEC 002). Incluído por invariants.sql.
set role ptw_api_test;
select set_config('ptw.unit_id',t.id('1')::text,false), set_config('ptw.person_id',t.id('d2')::text,false),
       set_config('ptw.auth','sessao',false), set_config('ptw.grants','cadastro',false);
select t.expect('23514','Perfis: sem permissão recusado',$$insert into ptw.access_profile(unit_id,id,name,permissions) values(t.id('1'),t.id('af01'),'Vazio','{}')$$);
select t.expect('23514','Perfis: permissão fora do catálogo recusada',$$insert into ptw.access_profile(unit_id,id,name,permissions) values(t.id('1'),t.id('af01'),'Root','{root}')$$);
select t.expect('42501','Perfis: quem só tem cadastro não cria perfil com auditoria',$$insert into ptw.access_profile(unit_id,id,name,permissions) values(t.id('1'),t.id('af01'),'Auditor','{auditoria}')$$);
insert into ptw.access_profile(unit_id,id,name,permissions) values(t.id('1'),t.id('af01'),'Gestor de cadastros','{cadastro}');
select t.expect('23505','Perfis: nome único',$$insert into ptw.access_profile(unit_id,id,name,permissions) values(t.id('1'),t.id('af02'),' gestor de CADASTROS ','{cadastro}')$$);
select t.expect('42501','Perfis: não acrescenta permissão que não tem',$$update ptw.access_profile set permissions='{cadastro,modelos}' where id=t.id('af01')$$);
-- Um administrador (todas) cria o perfil Administrador.
select set_config('ptw.grants','cadastro,modelos,auditoria,exportacao',false);
insert into ptw.access_profile(unit_id,id,name,permissions) values(t.id('1'),t.id('af02'),'Administrador','{cadastro,modelos,auditoria,exportacao}');
insert into ptw.person_group(unit_id,id,name) values(t.id('1'),t.id('af10'),'Administradores'),(t.id('1'),t.id('af11'),'Cadastro Norte');
insert into ptw.person_group_profile(unit_id,group_id,profile_id) values(t.id('1'),t.id('af10'),t.id('af02')),(t.id('1'),t.id('af11'),t.id('af01'));
insert into ptw.person_group_member(unit_id,group_id,person_id) values(t.id('1'),t.id('af11'),t.id('d1'));
select t.check((select array_agg(grant_key order by grant_key)='{cadastro}' from ptw.person_access_sources(t.id('1'),t.id('d1'))),'Perfis: membro recebe as permissões do perfil');
select t.check((select count(*)=0 from ptw.person_access_sources(t.id('1'),t.id('d2'))),'Perfis: quem não é membro não recebe');
-- Quem só tem cadastro: não mexe no grupo Administradores nem no perfil Administrador.
select set_config('ptw.grants','cadastro',false);
select t.expect('42501','Perfis: não adiciona membro a grupo com permissões que não tem',$$insert into ptw.person_group_member(unit_id,group_id,person_id) values(t.id('1'),t.id('af10'),t.id('d2'))$$);
select t.expect('42501','Perfis: não põe perfil Administrador em grupo',$$insert into ptw.person_group_profile(unit_id,group_id,profile_id) values(t.id('1'),t.id('af11'),t.id('af02'))$$);
select t.expect('42501','Perfis: não desativa perfil com permissões que não tem',$$update ptw.access_profile set active=false where id=t.id('af02')$$);
select t.expect('42501','Perfis: não desativa grupo com permissões que não tem',$$update ptw.person_group set active=false where id=t.id('af10')$$);
-- Mas gere o que tem: Cadastro Norte.
insert into ptw.person_group_member(unit_id,group_id,person_id) values(t.id('1'),t.id('af11'),t.id('d2'));
select t.check((select count(*)=1 from ptw.person_access_sources(t.id('1'),t.id('d2'))),'Perfis: inclusão por quem tem a permissão');
-- Grupo inativo, perfil inativo, pessoa desativada e conta vencida não concedem.
update ptw.person_group set active=false where id=t.id('af11');
select t.check((select count(*)=0 from ptw.person_access_sources(t.id('1'),t.id('d1'))),'Perfis: grupo inativo não concede');
update ptw.person_group set active=true where id=t.id('af11');
update ptw.access_profile set active=false where id=t.id('af01');
select t.check((select count(*)=0 from ptw.person_access_sources(t.id('1'),t.id('d1'))),'Perfis: perfil inativo não concede');
update ptw.access_profile set active=true where id=t.id('af01');
select t.check((select count(*)=1 from ptw.person_access_sources(t.id('1'),t.id('d1'))),'Perfis: reativação devolve a permissão');
select set_config('ptw.grants','',false);
select t.expect('42501','Perfis: sem permissões não retira membro de grupo com perfil',$$delete from ptw.person_group_member where group_id=t.id('af11') and person_id=t.id('d2')$$);
select set_config('ptw.grants','cadastro',false);
delete from ptw.person_group_member where group_id=t.id('af11') and person_id=t.id('d2');
select t.check((select count(*)=0 from ptw.person_access_sources(t.id('1'),t.id('d2'))),'Perfis: retirada do grupo retira a permissão');
-- Plantas do grupo: só local raiz.
select t.expect('23514','Perfis: planta do grupo precisa ser local raiz',$$insert into ptw.person_group_scope(unit_id,group_id,location_id) select t.id('1'),t.id('af11'),id from ptw.location where parent_id is not null limit 1$$);
insert into ptw.person_group_scope(unit_id,group_id,location_id) select t.id('1'),t.id('af11'),id from ptw.location where parent_id is null limit 1;
select t.check((select count(*)=1 from ptw.person_group_scope where group_id=t.id('af11')),'Perfis: planta registrada');
-- Isolamento, apagar e auditoria.
select set_config('ptw.unit_id',t.id('2')::text,false);
select t.check((select count(*)=0 from ptw.access_profile) and (select count(*)=0 from ptw.person_group_profile),'Perfis: outra unidade não lê');
select set_config('ptw.unit_id',t.id('1')::text,false);
select t.expect('42501','Perfis: API não apaga perfis',$$delete from ptw.access_profile$$);
select t.check((select count(*)=2 from ptw.audit_event where action='cadastro.perfil.criado'),'Perfis: criação auditada');
select t.check((select count(*)=2 from ptw.audit_event where action='cadastro.grupo.perfil.incluido'),'Perfis: vínculo auditado');
select t.check((select count(*)=1 from ptw.audit_event where action='cadastro.grupo.planta.incluida'),'Perfis: planta auditada');
select set_config('ptw.grants','',false), set_config('ptw.auth','',false);
reset role;
select t.check(ptw.audit_verify(t.id('1')) is null,'Perfis: cadeia íntegra');
