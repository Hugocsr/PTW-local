# SGI-07 e SGI-08 — Governança e delegação administrativa

Implementação autorizada no programa completo. Em 23/11/2026 o responsável confirmou: **somente aprovações administrativas explicitamente habilitadas; assinaturas técnicas indelegáveis**.

## Grupos e alçadas

Grupos persistidos por unidade: nome, descrição, situação, membros e revisão. Gestão pelo grant `cadastro`, incluindo leitura administrativa; composição não concede grants de sessão nem cargos técnicos. Pessoas/cargos/escopos/validade continuam nos cadastros reais existentes. Alçadas continuam sendo as etapas/assinaturas/separações da versão do modelo. Não haverá segundo motor de aprovação.

Lista → criar/editar grupo → selecionar membros → salvar com revisão → conferir outra sessão/recarregar. Desativação mantém membros e histórico. Se a revisão mudou, recarregar antes de editar novamente. Autor e diffs na trilha; RLS por unidade e FKs de membros no banco. Servidor indisponível não confirma escrita.

## Delegações

O primeiro escopo será a aprovação administrativa nominal em etapa livre anterior à Emissão. Uma nova versão deverá habilitar explicitamente “Aprovação administrativa delegável” e definir cargos exigidos. Âncoras técnicas do ciclo, emissão, aceites, entrega, retomada e revalidação continuam indelegáveis. Versões/PTs antigas não são modificadas.

Administração de cadastro cria/revoga, com motivo obrigatório, delegante nominal, delegado elegível, assinatura da versão, local opcional e período máximo inicial de sete dias, início inclusivo e fim exclusivo. Delegante continua podendo aprovar; o slot nominal exige uma conclusão. Não há auto-delegação, redelegação, concessão de cargo, transferência de identidade nem outra planta implícita. Alterar período/pessoas/escopo significa revogar e criar outro registro, preservando usos anteriores.

Na assinatura, ator real é a pessoa da sessão; a linha preserva delegação e representado. Conta/cargo/local dos dois e delegação são revalidados no banco no mesmo ato. Separação considera o ator real e a representação; uma pessoa representada não permite acumular atos incompatíveis. Revogação serializa com o uso. Pendências e histórico devem refletir isso sem falsificar o autor.

## Aceite

Grupos: persistência, revisão obsoleta, acesso direto negado ao operador, FK de outra unidade, indisponibilidade e cadeia íntegra. Delegações: lista de casos negativos/positivos da spec original, incluindo revogação com tela aberta, limites de período, cargos vencidos, etapas técnicas, duas pessoas simultâneas, uma conclusão, reload e histórico preservado. A task não fecha com cadastro de delegação sem integração à assinatura/pendência.
