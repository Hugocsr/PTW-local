# SGI-08 — Delegações temporárias de aprovação

Estado: **escopo administrativo nominal refinado e implementado**, 23/11/2026. Decisão explícita do responsável: assinaturas técnicas indelegáveis. Regras finais em [governanca-pessoas.md](governanca-pessoas.md); evidências e limites em [validacao-governanca-identidade.md](validacao-governanca-identidade.md). Cobre G20 no escopo inicial, sem delegação em cadeia ou entre plantas.

## Objetivo e fronteira

Permitir substituição temporária em uma aprovação explicitamente delegável, mantendo identidade real, motivo, escopo, vigência e rastreabilidade. Exemplo: uma pessoa designada para aprovar uma solicitação se ausenta; outra pessoa previamente elegível assume essa aprovação durante o período aprovado.

Não transfere cargo/habilitação, conta/senha, grants administrativos, unidade, assinatura técnica indelegável ou identidade de emitente original exigida em uma revalidação. Não substitui regras de isolamento, de documentos, de equipe, de turno ou de separação de pessoas.

## Escopo proposto

- Uma unidade no primeiro lote. Unidade/local e alçada/slot/modelo delimitam o escopo; “Todas as plantas” do HTML não habilita acesso fora da autorização atual.
- Cadastro: delegante, delegado, início/fim com fuso, motivo, escopo, situação e revisão.
- Listagem e filtros por pessoa, vigência e escopo; detalhe com autoria de criação, revogação e usos.
- Situação calculada pelo servidor: agendada, ativa, expirada ou revogada. Alteração substancial deve preservar a revisão já utilizada; não apagar a delegação usada em uma assinatura.
- Integração à pendência do delegado e à assinatura real, sem trocar a sessão para o delegante.

## Jornada e regras propostas

1. Pessoa autorizada seleciona delegante/delegado, escopo e período, informa motivo e vê os atos elegíveis afetados. A lista não deve sugerir pessoa sem acesso ou sem cargo válido.
2. Servidor valida a autoridade de quem cria e os limites dos dois participantes. A criação fica na cadeia de auditoria.
3. Na vigência, uma pendência delegável aparece ao delegado como “Em nome de …”, com vínculo ao ato de delegação e prazo.
4. Ao confirmar a aprovação, o servidor revalida identidade, sessão, delegação, período, escopo, slot, revisão, cargos/validade e impedimentos da PT dentro da mesma operação.
5. Assinatura e histórico mostram o ator real e o delegante representado, sem reescrever `personId` para simular a autoria do delegante.
6. Expiração/revogação encerra novos usos imediatamente. Assinaturas anteriores permanecem íntegras e identificáveis; revogar delegação não apaga nem anula automaticamente PTs já assinadas.

## Dependência mínima de governança

- Usar Stage/SignSlot/alçadas e cargos atuais; não criar motor de aprovação concorrente.
- Definir no modelo/versionamento quais slots são delegáveis. Padrão recomendado: não delegável; habilitação explícita em uma nova versão revisada, sem reescrever PT em curso ou encerrada.
- Definir representação de um delegado elegível para slot destinado a pessoa nominal, mantendo os requisitos de cargo/local e a separação de funções.
- Grupos podem organizar candidatos/participantes, mas associação a grupo não cria autorização técnica. Não é necessário esperar toda a biblioteca de risco/tipos/idiomas para entregar a delegação mínima.
- Múltiplas plantas, delegação em cadeia e transferência automática de equipe não entram no primeiro lote.

## Permissões a validar

- Proposta: delegante pode solicitar/criar apenas delegação da própria capacidade de aprovação, dentro do escopo autorizado; administração governa/revoga conforme permissão específica e motivo. A política de aprovação dessa criação precisa de decisão do responsável.
- Conta administrativa sem cargo técnico não recebe direito de assinar por cadastrar uma delegação. Nenhum campo editável no frontend pode escolher livremente uma pessoa representada.
- Consultas e avisos restringem-se às delegações que o usuário pode gerir/usar; acesso administrativo global exige permissão explícita, mantendo isolamento de unidade.

## Modelo/contrato a refinar

- Registro persistente de delegação/revisão, vínculos ao escopo e evento de revogação. Referências estáveis e histórico de uso, sem cópia de array em memória.
- Referência da assinatura ao ator real, pessoa representada e delegação/revisão utilizada. Manter integridade da trilha única e compatibilidade com assinaturas antigas sem delegação.
- Contratos OpenAPI: listar/detalhar, criar, revogar e consultar candidatos/capacidades efetivas. Refinar a extensão do ato de assinatura existente, sem endpoint que contorne os validadores.
- Regras equivalentes no núcleo puro e no banco; códigos/erros próprios conforme convenções. Validar escopo/período no servidor a cada uso, não apenas no cadastro ou quando a página abriu.
- Concorrência: revogação e assinatura simultâneas têm ordem transacional definida. Retry da mesma aprovação não cria assinatura/evento duplicado. Token/tela antiga não prorroga a delegação.

## Testes de aceite

| Caso | Resultado esperado |
|---|---|
| Pessoa habilitada, escopo correto, dentro da vigência, slot delegável | Aprovação aceita e pendência refletida; ator e delegante distintos no histórico |
| Antes do início, no fim ou após expirar | Recusa de uso; instante/fuso decidido no servidor |
| Revogada enquanto o delegado está com a tela aberta | Próxima tentativa recusada sem gravação parcial |
| Delegado sem cargo, cargo vencido ou conta desabilitada | Recusa, mesmo com delegação marcada ativa |
| Outra unidade/local/alçada/slot | Recusa e nenhum vazamento de dados/candidatos |
| Auto-delegação, ciclo ou re-delegação | Recusa conforme política inicial |
| Mesmo delegado tenta satisfazer duas assinaturas que exigem pessoas distintas | Recusa; delegação não elimina separação de pessoas |
| Slot técnico indelegável ou revalidação que exige emitente original | Regra original preservada; representação não é aceita como substituta |
| Delegante e delegado aprovam o mesmo slot/revisão simultaneamente | Uma conclusão válida, sem assinatura dupla ou avanço duplicado |
| Retry ou recarga | Resultado consistente, sem duplicação; delegação e assinatura persistem |
| Alterar/revogar depois do uso | Autoria e evidência antigas intactas; só novos usos são afetados |
| Servidor indisponível/sessão expirada | Aprovação não confirma; Parar/Entrega conservam suas regras atuais |
| Dois modelos Actemium e três perfis | Ciclos passam sem enfraquecer documentos, isolamento, turno, retomada ou encerramento |

## Decisões obrigatórias antes do código

1. Quais aprovações podem ser delegadas e como a versão registra isso; quais continuam indelegáveis.
2. Quem cria/aprova/revoga: delegante, gestor ou administrador; permissão e motivo exigidos.
3. Escopo mínimo, duração máxima, semântica dos limites de horário e tratamento de períodos sobrepostos.
4. Se o delegante continua apto a aprovar durante a delegação; recomendação inicial: sim, com uma única conclusão do slot.
5. Congelamento da alçada, integração da pendência/assinatura e nomes dos campos/eventos no contrato.
6. Preservação de dados existentes, ensaio em instalação separada e reversão do lote antes de aplicar esquema no ambiente em uso.
