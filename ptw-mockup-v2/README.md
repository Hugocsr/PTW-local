# O app do PTW in a Box

A interface do sistema de Permissão de Trabalho, em português do Brasil. React 19, TypeScript, Vite, Tailwind v4 e shadcn/ui. O nome da pasta é histórico: não é mais um protótipo; os dados vêm da API em `../ptw-server`.

```sh
npm install
npx vite --port 5175   # http://localhost:5175; /api, /status.json e /tema vão ao Docker em https://localhost
npm run check          # tipos, lint (camadas e tamanho de arquivo) e testes
npm run build
```

O servidor precisa estar no ar (`../ptw-server`, ver o [README da raiz](../README.md)).

## Telas

- **Trabalho**: Minha área (Sua vez, Aguardando, Em campo), Quadro de PTs, Desabilitados agora, tela de parede e a PT (Formulário, Equipe, Histórico), com Imprimir e Imprimir em branco.
- **Cadastro**: Locais, Ativos, Pessoas.
- **Configuração**: Modelos de PT (Escopo, Fluxo, Testar, importação), Tipos, Listas, Auditoria.

## Onde está cada coisa

| Pasta | Conteúdo |
|---|---|
| `src/core/` | As regras, puras e testadas (sem React, sem API). Espelham o banco. |
| `src/data/` | Acesso à API e ao tema da planta. As telas só usam `port`, `hooks` e `context`. |
| `src/components/work`, `registry`, `audit` | As telas. |
| `src/components/shell`, `signal` | Peças comuns (moldura, estado, marca, indicadores). |
| `src/components/ui` | Componentes shadcn. |
| `src/demo/` | Dados de teste em memória; o navegador nunca os carrega. |

Regras de produto: [`../AGENTS.md`](../AGENTS.md). Código: [`../CONVENCOES.md`](../CONVENCOES.md). Interface: [`../DESIGN.md`](../DESIGN.md). Detalhe das pastas para agentes: [`AGENTS.md`](AGENTS.md).
