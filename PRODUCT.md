# PTW in a Box

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

App: `ptw-mockup-v2` (React + TypeScript + Vite + Tailwind + shadcn/ui), com dados persistidos pela API Fastify. Servidor: `ptw-server`, Docker Compose com Caddy/HTTPS, PostgreSQL 18 e SeaweedFS. Login LDAP/AD com TLS, grupos administrativos, sessões e recusas auditadas. Instalação, laboratório LDAP local e backup/restauração estão em `ptw-server/OPERACAO.md`.

## Users

Pessoas da planta que solicitam, analisam, emitem, executam e encerram trabalhos. Cada pessoa começa em Minha área (Sua vez · Aguardando · Em campo); o Quadro reúne as PTs. Permissões administrativas controlam cadastro, modelos, consulta à Auditoria e exportação. Cargos e elegibilidade para atos de PT são definidos no banco e não vêm dos grupos LDAP.

## Product Purpose

Um sistema de permissão de trabalho que a planta executa no próprio servidor e na rede interna, sem depender de internet. O mesmo pacote pode rodar em um equipamento portátil onde não há servidor disponível.

## Operating Context

Solicitação, análise de riscos e controles, emissão, aceite no campo, acompanhamento, parada, entrega e encerramento. Computadores da sala de controle e celulares/tablets de campo acessam um único servidor local, que confirma o estado da PT.

## Capabilities and Constraints

Modelos e regras configuráveis e versionados; trilha de auditoria e evidências; backup e recuperação locais.

- **O sistema se adapta ao formulário da planta.** Modelos representam texto, marcação, verificação, números com unidade e faixa, horário, data, documentos, pessoas, pontos de isolamento, grupos repetíveis e assinaturas condicionais.
- **Importação de modelo.** A skill externa `ptw-modelo-de-formulario` lê o formulário em qualquer idioma e gera `ptw.modelo/1`, com página e trecho literal de origem para cada elemento. O app lista tudo antes da confirmação e cria apenas uma versão em rascunho sugerida pela importação; uma pessoa revisa e ativa. O app não depende de IA nem de internet.
- **Um equipamento, uma PT aberta**, incluindo ativos ligados por "parte de", conferido no núcleo e no banco. A opção por versão "Prende o equipamento" permite os modelos que não ocupam o ativo, conforme a regra documentada em `AGENTS.md`.
- **Auditoria completa.** Alterações, recusas, desfazer, acessos, sessões e eventos do sistema entram na mesma cadeia SHA-256. Verificador independente e âncora diária assinada permitem conferir a integridade; a retenção mínima é de cinco anos. O destino externo é configurado na instalação.
- **IA só sugere e cita a fonte.** Nunca assina, muda o estado da PT, responde um item de segurança ou diz que o trabalho pode começar. Ideias futuras estão em `ptw-research/ai-differentiators-research-2026-11-08.md`.
- Notificações e módulos estão adiados. Sem confirmação do servidor, o aparelho não emite, aprova nem afirma a validade atual da PT. Procedimentos e requisitos aplicáveis precisam ser validados na planta piloto.

## Evidence on Hand

Pesquisa: `ptw-research/ptw-landscape-2026-11-05.md` e `ptw-research/ptw-in-a-box-spec.md`. O backend local e o laboratório usam dados fictícios carregados por comando explícito. A interface não mostra aviso de simulação. Os testes reais de banco, LDAP, arquivos, auditoria, restauração e navegador estão registrados em `fabrica/diario.md`; a implantação na planta ainda exige seus parâmetros e validação no local.

A [especificação completa](ptw-research/full-platform-spec-2026-11-06.md) registra a pesquisa da arquitetura e das capacidades desejadas. Decisões posteriores estão em `AGENTS.md`, no esquema do banco e em `fabrica/diario.md`; a pesquisa não substitui essas decisões.
O [cenário piloto](ptw-research/electrical-panel-ptw-use-case-2026-11-06.md) trata de instalação, reforma e comissionamento de painéis elétricos em um CCM existente. O [mapeamento regulatório](ptw-research/brazil-regulatory-mapping-2026-11-06.md) é referência de pesquisa para a revisão dos requisitos de cada planta.

## Product Principles

- A autorização atual para trabalhar deve ser inequívoca.
- O fluxo deve ser curto, preservando separação de funções e verificações de segurança.
- A planta configura o processo sem enfraquecer a integridade dos registros.
- O sistema funciona e pode ser recuperado localmente, sem depender de nuvem.
