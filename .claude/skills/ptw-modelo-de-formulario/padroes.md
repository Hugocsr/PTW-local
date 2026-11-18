# Padrões difíceis do pacote `ptw.modelo/1`

Cada caso abaixo já deu errado em um formulário real. Copie a forma; troque rótulos e trechos pelos do seu papel. Os textos de exemplo são fictícios.

## 1 Formulário que desabilita uma proteção (intertravamento, bypass, dispositivo de segurança)

Essa PT **acompanha** a PT do serviço no mesmo equipamento. Se o pacote não disser isso, ninguém consegue abri-la em equipamento que já tem PT.

```json
"modelo": {
  "nome": "Desabilitação de intertravamento",
  "prazo_maximo_horas": 168,
  "prende_equipamento": false,
  "escopo": { "tipos_de_local": [], "tipos_de_ativo": [] }
}
```

- Errado: omitir `prende_equipamento` (o padrão é `true`).
- A etapa em que a proteção volta ("reabilitação", "normalização") é o `aceite_area`; a que desabilita é o `aceite_campo`.

## 2 Aprovação por classe ou nível (uma tabela "classe → quem aprova")

Uma assinatura **por classe**, cada uma exigida só quando aquela classe é a escolhida. Quem aprova uma classe: os cargos impressos para ela **e** os dos níveis acima.

```json
{ "ref": "classe", "tipo": "marcacao", "rotulo": "Classe", "obrigatorio": true, "multipla": false, "outro": false,
  "opcoes": [ { "rotulo": "Classe 1" }, { "rotulo": "Classe 2" }, { "rotulo": "Classe 3", "impede": true } ],
  "origem": { "pagina": 1, "trecho": "CLASSE 1 [ ]  CLASSE 2 [ ]  CLASSE 3 [ ]" } }
```

```json
{ "ref": "a_cl2", "significado": "Autoriza a desabilitação classe 2",
  "cargo": ["Gerente da área", "Coordenador da área"],
  "minimo": 1, "obrigatoria": true,
  "obrigatoria_quando": { "item": "classe", "valores": ["Classe 2"] },
  "observacao": "Classe 2 pede Coordenador; o Gerente (nível acima, classe 3) também aprova.",
  "origem": { "pagina": 1, "trecho": "CLASSE | APROVAÇÃO MÍNIMA / 2 | Coordenador da área" } }
```

- A classe que o papel diz que **não pode** ("não forçável", "proibido") é uma opção com `"impede": true`, sem assinatura.
- Errado: uma assinatura só, com todos os cargos de todas as classes (qualquer um aprovaria qualquer classe).
- Errado: `valores` com texto diferente do `rotulo` da opção ("classe 2", "2").
- Prazo diferente por classe: `prazo_maximo_horas` = o maior, mais esta pendência:

```json
{ "descricao": "Prazo máximo por classe (classe 1: 7 dias; classe 2: 5 dias) não é representado: o modelo usa o maior para todo pedido.",
  "motivo": "fora_do_produto", "onde": "classe",
  "sugestao": "Se o cliente precisar do limite por classe, separar em um modelo por classe.",
  "origem": { "pagina": 1, "trecho": "PRAZO MÁXIMO" } }
```

## 3 Colunas de resposta que não são Sim / Não / N.A.

O papel tem só "SIM" e "N.A." (ou "OK / Não OK"). Não acrescente a coluna que falta.

```json
"listas": [ { "nome": "SIM / N.A.", "itens": ["SIM", "N.A."], "origem": { "pagina": 1, "trecho": "Preencha as colunas com x no SIM ou N.A." } } ]
```

```json
{ "ref": "verif", "tipo": "verificacao", "rotulo": "Itens de verificação", "obrigatorio": true,
  "respostas": "lista", "lista_respostas": "SIM / N.A.",
  "linhas": [ { "ref": "v1", "rotulo": "Foi estabelecida uma proteção alternativa?", "impede": [], "justificar": [],
                "origem": { "pagina": 1, "trecho": "1. Foi estabelecida uma proteção alternativa?" } } ],
  "origem": { "pagina": 1, "trecho": "ITENS DE VERIFICAÇÃO" } }
```

- `impede` e `justificar` levam os **rótulos** dos itens da lista (`["N.A."]`), e só quando o papel manda.
- Errado: `respostas: "sim_nao_na"` quando o papel não tem a coluna "Não".

## 4 Escolha de um catálogo que a planta ainda não mandou (tags, equipamentos, áreas)

Lista declarada **sem itens** + item que a usa + pendência que pede os itens. Nunca invente itens "de exemplo".

```json
"listas": [ { "nome": "Intertravamentos", "itens": [], "origem": { "pagina": 1, "trecho": "TAG DO INTERTRAVAMENTO:" } } ]
```

```json
{ "ref": "tag", "tipo": "marcacao", "rotulo": "Tag do intertravamento", "obrigatorio": true, "multipla": false, "outro": false,
  "lista": "Intertravamentos", "opcoes": [],
  "origem": { "pagina": 1, "trecho": "TAG DO INTERTRAVAMENTO:" } }
```

```json
{ "descricao": "A lista 'Intertravamentos' está vazia: o cliente precisa mandar as tags. A versão só ativa com a lista preenchida.",
  "motivo": "sem_fonte", "onde": "tag", "origem": { "pagina": 1, "trecho": "TAG DO INTERTRAVAMENTO:" } }
```

- Errado: `texto` livre para a tag (perde a busca e o painel "Desabilitados agora", que lê a escolha).
- Ponha os itens de **escolha única e texto curto que identificam o pedido** (tipo, classe, tag) no começo da primeira seção: o painel mostra as três primeiras respostas desse tipo.

## 5 Pergunta que só aparece conforme outra resposta

```json
{ "ref": "classe", "tipo": "marcacao", "rotulo": "Classe", "obrigatorio": true, "multipla": false, "outro": false,
  "opcoes": [ { "rotulo": "Classe 1" }, { "rotulo": "Classe 2" } ],
  "mostrar_quando": { "item": "tipo", "valores": ["Intertravamento lógico", "Intertravamento físico"] },
  "origem": { "pagina": 1, "trecho": "CLASSE 1 [ ]  CLASSE 2 [ ]" } }
```

- O item apontado (`tipo`) vem **antes** no pacote.
- Opção do item apontado que deixa o caminho sem resposta no papel (ex.: "Dispositivo de segurança" não tem classe, então não se sabe quem aprova): pendência `duvida` com a pergunta ao cliente.

## 6 Etapa que o papel não tem

Omita a etapa. O importador a inclui e cria a pendência "Escolha quem assina". Não invente cargo nem significado para ela.

## 7 Contatos e pessoas no papel

Rodapé com ramal, celular, rádio, nomes de plantão: **uma** pendência, sem os números.

```json
{ "descricao": "Rodapé com contatos de emergência. Melhor como dado da unidade do que como item do modelo.", "motivo": "fora_do_produto" }
```

`modelo.politica_eletrica` é extensão opcional para preservar os controles NR-10 de um modelo existente: base `vigente2019`/`preparacao2027`, refs documentais, classificação, sequências e turno. Não inferir política nem procedimento técnico de informações ausentes no documento. O pacote sempre importa como rascunho sujeito à revisão humana.
