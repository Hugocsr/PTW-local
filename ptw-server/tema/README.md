# Tema da planta

O que estiver nesta pasta é servido em `/tema/` e muda a aparência do app **sem reconstruir nada**:
basta trocar os arquivos e recarregar a página. Pasta vazia (só este arquivo) = aparência padrão.

Para trocar: `sh tema.sh <pasta-do-tema>` (copia para cá) ou `sh tema.sh padrao` (volta ao padrão).
Exemplo pronto: `sh tema.sh tema-exemplos/floresta`.

## `tema.json`

```json
{
  "nome": "PTW Local",
  "sigla": "PT",
  "logo": "logo.svg",
  "cores": { "marca": "#0b5d3b", "fundo": "#f2f5f1", "tinta": "#10201a" },
  "fonte": { "familia": "Inter", "arquivo": "inter.woff2" }
}
```

Tudo é opcional; o que faltar fica no padrão.

| Chave | O que muda | Regra |
|---|---|---|
| `nome` | Nome no menu, na entrada e na aba do navegador | 1 a 40 caracteres |
| `sigla` | Letras da marca quando não há logotipo | 1 a 3 caracteres |
| `logo` | Logotipo largo (símbolo + nome), numa linha própria no menu e na entrada | arquivo `svg`, `png` ou `webp` nesta pasta |
| `simbolo` | Símbolo quadrado (ex.: só a folha) no lugar das letras, ao lado do nome | arquivo `svg`, `png` ou `webp` nesta pasta |
| `cores.marca` | Botão principal, marca e foco | `#rrggbb`; texto branco ou escuro tem de ler sobre ela (4,5:1) |
| `cores.fundo` | Fundo da página e do menu; os outros cinzas (blocos, linhas, texto secundário) saem dele e da tinta | `#rrggbb` bem claro; o texto tem de ler sobre ele (7:1) |
| `cores.tinta` | Cor do texto | `#rrggbb` escuro (7:1 sobre branco) |
| `fonte.familia` | Fonte do texto | nome da fonte |
| `fonte.arquivo` | Arquivo da fonte | `woff2`, `woff` ou `ttf` nesta pasta; sem ele, a fonte precisa existir no aparelho |

**O tema não muda as cores de estado** (verde concluído, azul sua vez, âmbar atenção, vermelho parado):
são sinal de segurança e são iguais em toda planta.

Valor recusado (cor que não lê, arquivo fora da pasta) é ignorado, o padrão fica naquele ponto e o
motivo aparece no console do navegador (`tema.json: …`).

Os arquivos daqui não entram no git (logotipo e fonte são do cliente).
