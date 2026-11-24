-- Included by invariants.sql; all fixtures are created through ordinary domain operations.
reset role;
insert into ptw.unit(id,code,name) values(t.id('de01'),'UN-DELEG','Teste administrativo');
select set_config('ptw.unit_id',t.id('de01')::text,false), set_config('ptw.person_id',null::text,false), set_config('ptw.auth','servico',false);
insert into ptw.type_def(unit_id,id,family,label) values(t.id('de01'),t.id('de03'),'cargo','Aprovador'),(t.id('de01'),t.id('de04'),'local','Galpão');
insert into ptw.location(unit_id,id,type_id,code,name) values(t.id('de01'),t.id('de02'),t.id('de04'),'GALPAO','Galpão de testes'),(t.id('de01'),t.id('de06'),t.id('de04'),'OUTRO','Outro galpão');
insert into ptw.type_def(unit_id,id,family,label) values(t.id('de01'),t.id('de05'),'ativo','Painel');
insert into ptw.asset(unit_id,id,type_id,code,name) values(t.id('de01'),t.id('de07'),t.id('de05'),'PAINEL-TESTE','Painel fictício');
insert into ptw.asset_location(unit_id,asset_id,location_id) values(t.id('de01'),t.id('de07'),t.id('de02'));
insert into ptw.person(unit_id,id,name,login) values
 (t.id('de01'),t.id('de11'),'Delegante','delegante'),(t.id('de01'),t.id('de12'),'Delegado','delegado'),
 (t.id('de01'),t.id('de13'),'Solicitante','solicitante'),(t.id('de01'),t.id('de14'),'Sem cargo','semcargo');
insert into ptw.person_role(unit_id,person_id,role_id,valid_until)
 select t.id('de01'),t.id(x),t.id('de03'),current_date+365 from unnest(array['de11','de12','de13']) x;
insert into ptw.template(unit_id,id,name) values(t.id('de01'),t.id('de20'),'Com aprovação administrativa');
insert into ptw.template_version(unit_id,id,template_id,number) values(t.id('de01'),t.id('de21'),t.id('de20'),1);
insert into ptw.stage(unit_id,id,version_id,position,name,kind,locked) values
 (t.id('de01'),t.id('de30'),t.id('de21'),0,'Solicitação','solicitacao',true),
 (t.id('de01'),t.id('de31'),t.id('de21'),1,'Aprovação administrativa',null,false),
 (t.id('de01'),t.id('de32'),t.id('de21'),2,'Emissão','emissao',true),
 (t.id('de01'),t.id('de33'),t.id('de21'),3,'Aceite no campo','aceite_campo',true),
 (t.id('de01'),t.id('de34'),t.id('de21'),4,'Entrega','entrega',true),
 (t.id('de01'),t.id('de35'),t.id('de21'),5,'Aceite da área','aceite_area',true);
insert into ptw.sign_slot(unit_id,id,version_id,stage_id,position,meaning,kind,role_ids,person_id,delegable) values
 (t.id('de01'),t.id('de40'),t.id('de21'),t.id('de30'),0,'Solicita','cargo',array[t.id('de03')],null,false),
 (t.id('de01'),t.id('de41'),t.id('de21'),t.id('de31'),0,'Aprova administrativamente','pessoa',array[t.id('de03')],t.id('de11'),true),
 (t.id('de01'),t.id('de42'),t.id('de21'),t.id('de32'),0,'Emite','cargo',array[t.id('de03')],null,false),
 (t.id('de01'),t.id('de43'),t.id('de21'),t.id('de33'),0,'Aceita','cargo',array[t.id('de03')],null,false),
 (t.id('de01'),t.id('de44'),t.id('de21'),t.id('de34'),0,'Entrega','cargo',array[t.id('de03')],null,false),
 (t.id('de01'),t.id('de45'),t.id('de21'),t.id('de35'),0,'Encerra','cargo',array[t.id('de03')],null,false);
insert into ptw.separation(unit_id,version_id,slot_a,slot_b) values(t.id('de01'),t.id('de21'),t.id('de41'),t.id('de42'));
select t.expect('23514','Delegação: etapa técnica nunca delegável',$$update ptw.sign_slot set delegable=true,kind='pessoa',person_id=t.id('de11') where unit_id=t.id('de01') and id=t.id('de42')$$);
select t.expect('23514','Delegação: etapa livre não se transforma em técnica',$$update ptw.stage set kind='emissao' where unit_id=t.id('de01') and id=t.id('de31')$$);
select ptw.version_activate(t.id('de01'),t.id('de21'));
set role ptw_api_test;
select set_config('ptw.unit_id',t.id('de01')::text,false), set_config('ptw.person_id',t.id('de11')::text,false), set_config('ptw.auth','sessao',false);
select t.expect('23514','Delegação: assinatura técnica recusada',$$insert into ptw.delegation(unit_id,id,slot_id,delegator_id,delegate_id,starts_at,ends_at,reason,created_by) values(t.id('de01'),t.id('de60'),t.id('de42'),t.id('de11'),t.id('de12'),now(),now()+interval '8 hour','Ausência',t.id('de11'))$$);
select t.expect('23514','Delegação: auto-delegação recusada',$$insert into ptw.delegation(unit_id,id,slot_id,delegator_id,delegate_id,starts_at,ends_at,reason,created_by) values(t.id('de01'),t.id('de60'),t.id('de41'),t.id('de11'),t.id('de11'),now(),now()+interval '8 hour','Ausência',t.id('de11'))$$);
select t.expect('23514','Delegação: cargo ausente recusado',$$insert into ptw.delegation(unit_id,id,slot_id,delegator_id,delegate_id,starts_at,ends_at,reason,created_by) values(t.id('de01'),t.id('de60'),t.id('de41'),t.id('de11'),t.id('de14'),now(),now()+interval '8 hour','Ausência',t.id('de11'))$$);
select t.expect('23514','Delegação: prazo maior que sete dias recusado',$$insert into ptw.delegation(unit_id,id,slot_id,delegator_id,delegate_id,starts_at,ends_at,reason,created_by) values(t.id('de01'),t.id('de60'),t.id('de41'),t.id('de11'),t.id('de12'),now(),now()+interval '8 day','Ausência',t.id('de11'))$$);
insert into ptw.delegation(unit_id,id,slot_id,delegator_id,delegate_id,scope_location_id,starts_at,ends_at,reason,created_by)
 values(t.id('de01'),t.id('de60'),t.id('de41'),t.id('de11'),t.id('de12'),t.id('de02'),now(),now()+interval '8 hour','Ausência temporária',t.id('de11'));
select t.expect('23505','Delegação: sobreposição recusada',$$insert into ptw.delegation(unit_id,id,slot_id,delegator_id,delegate_id,starts_at,ends_at,reason,created_by) values(t.id('de01'),t.id('de61'),t.id('de41'),t.id('de11'),t.id('de12'),now(),now()+interval '2 hour','Ausência',t.id('de11'))$$);
select t.check(ptw.delegation_for(t.id('de01'),t.id('de41'),t.id('de12'),(select path from ptw.location where id=t.id('de02'))) = t.id('de60'),'Delegação: mandato válido encontrado');
select t.check(ptw.delegation_for(t.id('de01'),t.id('de41'),t.id('de12'),(select path from ptw.location where id=t.id('de06'))) is null,'Delegação: outro galpão não autorizado');
select set_config('ptw.unit_id',t.id('de01')::text,false), set_config('ptw.person_id',t.id('de13')::text,false), set_config('ptw.auth','sessao',false);
insert into ptw.permit(unit_id,id,template_id,version_id,author_id,location_id,work_window,scope)
 values(t.id('de01'),t.id('de70'),t.id('de20'),t.id('de21'),t.id('de13'),t.id('de02'),tstzrange(now()-interval '5 min',now()+interval '4 hour','[)'),'Teste administrativo');
insert into ptw.permit_asset(unit_id,permit_id,asset_id) values(t.id('de01'),t.id('de70'),t.id('de07'));
select ptw.permit_submit(t.id('de01'),t.id('de70'));
select t.check(ptw.permit_mine(t.id('de01'),t.id('de70'),t.id('de12')),'Delegação: pendência no Quadro');
select t.check(exists(select 1 from ptw.my_permits(t.id('de01'),t.id('de12')) p where p=t.id('de70')),'Delegação: pendência na Minha área');
select set_config('ptw.unit_id',t.id('de01')::text,false), set_config('ptw.person_id',t.id('de11')::text,false), set_config('ptw.auth','sessao',false);
update ptw.delegation set revoked_at=now(),revoked_reason='Fim da substituição' where id=t.id('de60');
select set_config('ptw.unit_id',t.id('de01')::text,false), set_config('ptw.person_id',t.id('de12')::text,false), set_config('ptw.auth','sessao',false);
select t.expect('PTW08','Delegação: tela antiga não assina após revogação',$$select ptw.permit_sign(t.id('de01'),t.id('de70'),t.id('de41'),1)$$);
select t.check(not ptw.permit_mine(t.id('de01'),t.id('de70'),t.id('de12')),'Delegação: revogação remove pendência');
select set_config('ptw.unit_id',t.id('de01')::text,false), set_config('ptw.person_id',t.id('de11')::text,false), set_config('ptw.auth','sessao',false);
insert into ptw.delegation(unit_id,id,slot_id,delegator_id,delegate_id,scope_location_id,starts_at,ends_at,reason,created_by)
 values(t.id('de01'),t.id('de61'),t.id('de41'),t.id('de11'),t.id('de12'),t.id('de02'),now(),now()+interval '8 hour','Nova autorização',t.id('de11'));
update ptw.person set enabled=false where id=t.id('de11');
select set_config('ptw.unit_id',t.id('de01')::text,false), set_config('ptw.person_id',t.id('de12')::text,false), set_config('ptw.auth','sessao',false);
select t.expect('PTW08','Delegação: delegante desativado impede uso',$$select ptw.permit_sign(t.id('de01'),t.id('de70'),t.id('de41'),1)$$);
update ptw.person set enabled=true where id=t.id('de11');
update ptw.person_role set valid_until=(now() at time zone 'America/Sao_Paulo')::date-1 where person_id=t.id('de12');
select t.expect('PTW08','Delegação: delegado com cargo vencido recusado',$$select ptw.permit_sign(t.id('de01'),t.id('de70'),t.id('de41'),1)$$);
update ptw.person_role set valid_until=current_date+365 where person_id=t.id('de12');
select ptw.permit_sign(t.id('de01'),t.id('de70'),t.id('de41'),1);
select t.check((select person_id=t.id('de12') and represented_person_id=t.id('de11') and delegation_id=t.id('de61') from ptw.signature where permit_id=t.id('de70') and slot_id=t.id('de41')),'Delegação: identidade real e representação preservadas');
select t.expect('PTW09','Delegação: ator não acumula aprovação e emissão separadas',$$select ptw.permit_sign(t.id('de01'),t.id('de70'),t.id('de42'),1)$$);
select set_config('ptw.unit_id',t.id('de01')::text,false), set_config('ptw.person_id',t.id('de11')::text,false), set_config('ptw.auth','sessao',false);
select t.expect('PTW09','Delegação: representado não contorna separação',$$select ptw.permit_sign(t.id('de01'),t.id('de70'),t.id('de42'),1)$$);
update ptw.delegation set revoked_at=now(),revoked_reason='Encerramento da substituição' where id=t.id('de61');
select t.check((select count(*)=1 from ptw.signature where permit_id=t.id('de70') and delegation_id=t.id('de61') and voided_at is null),'Delegação: revogação preserva assinatura anterior');
select t.expect('42501','Delegação: API não altera identidade do mandato',$$update ptw.delegation set delegate_id=t.id('de13') where id=t.id('de61')$$);
select t.expect('42501','Delegação: API não apaga mandatos',$$delete from ptw.delegation$$);
select t.check((select count(*)=1 from ptw.audit_event where action='pt.assinatura' and data->>'delegacao'=t.id('de61')::text and data->>'representado'=t.id('de11')::text),'Delegação: representação auditada');
select set_config('ptw.unit_id',t.id('1')::text,false), set_config('ptw.person_id',t.id('d2')::text,false), set_config('ptw.auth','sessao',false);
select t.check((select count(*)=0 from ptw.delegation),'Delegação: outra unidade não lê mandatos');
reset role;
select t.check(ptw.audit_verify(t.id('de01')) is null,'Delegação: cadeia íntegra');
