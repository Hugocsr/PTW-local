# SGI-15 — Autores sem nome nos filtros da Auditoria

Estado: proposta para validação; encontrada durante o primeiro lote em 23/11/2026. Não implementada.

## Problema e evidência

No laboratório SQL isolado, a fixture canônica contém evento com `actor_id` preenchido e `actor_name` nulo. `GET /audit/facets` devolve HTTP 500 / PTA99: `response/actors/3/name: must be string`. O contrato exige texto e o repositório retorna `actor_name` sem tratar ausência. O comportamento aparece tanto no código HEAD anterior quanto depois do merge visual. Não é prova de falha no Docker ou Vercel atuais.

## Escopo proposto

Definir representação explícita “Autor não identificado”, preservando o identificador e os eventos originais. Ajustar leitura/contrato conforme a decisão; não inventar um nome, excluir eventos, mudar a cadeia ou ampliar permissões. Manter isolamento da unidade e acesso exclusivo ao grant de auditoria.

## Aceite

- Filtros carregam com nomes presentes e ausentes, sem HTTP 500.
- Busca pelo identificador original continua válida; metadados históricos/cadeia intactos.
- Sem grant de auditoria, API recusa e tela mantém sua restrição.
- Teste significativo no repositório/API com dado nulo e contrato de resposta validado.
- Validar localmente antes de publicar; registrar a reversão e evidências.
