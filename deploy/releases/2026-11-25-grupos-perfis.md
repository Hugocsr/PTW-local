# Publicação de homologação: Grupos SGI e Perfis de acesso (SPEC 002)

- **Destino:** `Hugocsr/PTW-local`, branch `ptw-sgi` (Preview na Vercel). Não promover `main`.
- **Pré-requisito:** o banco já tem a publicação de 24/11 (`2026-11-24-ativos-delegacoes-dashboard.sql`).

## Conteúdo

- Grupos no formato SGI (lista + detalhe), com perfis, plantas, membros e Desativar/Reativar.
- Nova tela **Perfis de acesso**; Grupos e Perfis passam para **Cadastros**.
- Permissões efetivas = diretório (LDAP) + perfis dos grupos, valendo na chamada seguinte.
- Seção "Permissões de acesso" na ficha da pessoa.

## Banco hospedado: rodar ANTES do push

Arquivo `2026-11-25-grupos-perfis.sql`, aditivo, numa transação só (SQL Editor do Supabase):

1. cria `access_profile`, `person_group_profile`, `person_group_scope`, as funções de origem das permissões e os gatilhos de guarda;
2. liga a trilha de auditoria nas três tabelas;
3. RLS por unidade e privilégios de `ptw_app`;
4. grava `sistema.esquema.alterado` com os SHA-256 de `db/schema`.

Ensaio (25/11): esquema de 24/11 → script → `pg_dump -s` idêntico ao esquema novo criado do zero.

Sem o script, a API nova responde erro 500 em toda chamada autenticada (ela lê `ptw.person_access_sources`).

## Depois de publicar

- Nenhum grupo concede nada até receber um perfil: crie os perfis em Cadastros › Perfis de acesso e associe aos grupos.
- No local (Docker), zere o banco ou rode de novo `python tools/ptw_instalar.py --local`: a carga de exemplo já traz os 4 perfis e 3 grupos.
