---
name: ptw-modelo-de-formulario
description: "Lê o formulário de Permissão de Trabalho (PT) de uma planta — PDF, foto, escaneado, Word ou Excel, em português, inglês ou outro idioma — e gera um pacote `ptw.modelo/1` (JSON) que o PTW in a Box importa como rascunho de modelo. Use quando pedirem para mapear, importar ou converter um formulário de PT, transformar um formulário em modelo, ler uma permissão de trabalho em papel, ou 'map/import a permit-to-work form'. Não ativa nada: uma pessoa revisa e ativa no app."
user-invocable: true
argument-hint: "<arquivo(s) do formulário> [--saida <pasta>] [--idioma-rotulos pt-BR]"
---

# Formulário de PT → pacote `ptw.modelo/1`

Você lê o formulário da planta e escreve **um arquivo**. O app importa esse arquivo e cria um **rascunho**; uma pessoa revisa e ativa. Você nunca ativa, nunca assina e nunca "completa" o que o papel não diz.

Referências nesta pasta:
- `ptw-modelo.schema.json` — o contrato (JSON Schema 2020-12). Gerado do código; não edite à mão.
- `exemplos/intervencao-desenergizada-em-painel.ptw-modelo.json` — um pacote completo e válido.
- `padroes.md` — os casos que mais dão errado, cada um com o trecho de JSON certo (aprovação por classe, respostas de lista, catálogo que não veio, formulário de desabilitação). **Leia antes de mapear.**
- Código: `ptw-mockup-v2/src/core/templatePackage.ts` (validador e importador), `src/core/form.ts` (tipos de item), `src/registry/types.ts`.
- Fundamento: `ptw-research/ai-form-mapping-research-2026-11-08.md` §5 e `ptw-research/specs/10-paper-forms-adaptation.md` §1.

## Regras que não se negociam

1. **Nunca invente.** Todo item, linha, opção, item de lista e assinatura cita `origem` = `{ pagina, trecho }`, com `trecho` **literal**, copiado do documento no idioma do documento. O validador recusa rótulo cujas palavras não estejam no trecho.
2. **Nunca junte** itens distintos em um, nem divida um item do papel em vários sem motivo visível no papel.
3. **Na dúvida, pendência.** O que é ambíguo, ilegível, cortado ou fora do produto vai para `pendencias` (com `origem` quando houver), não para um palpite. O app representa o formulário inteiro: tudo que tem tipo na tabela abaixo vira item, nunca pendência por falta de tipo.
4. **Faixa só com fonte no papel.** Nunca preencha `minimo`/`maximo` "da norma". Se a NR traz o número e o papel não, deixe sem faixa e registre uma pendência com a referência como `sugestao`.
5. **Cargo só se o papel nomeia.** Se não diz quem assina, `cargo: null` (vira pendência). Não deduza cargo por costume. Cargo que a planta ainda não tem é escrito como o papel diz: o app o cria (sem ninguém) e avisa que ninguém assina até alguém recebê-lo. Quando o papel aceita **qualquer um** de vários cargos ("Gerente industrial, Gerente de manutenção ou Gerente da área"), `cargo` é a **lista** desses nomes (ou `cargos: [...]`): uma assinatura só, que qualquer um deles dá.
6. **Etapas fixas e travas são do produto**: você só aponta qual bloco do papel corresponde a qual etapa.
7. **Nenhum dado pessoal ou de contato.** Nome de pessoa, matrícula, CPF, telefone, ramal, celular, canal de rádio e e-mail não entram em rótulo, `texto` de aviso, `trecho` nem `observacao`. Rodapé de contatos de emergência vira **uma** pendência (`fora_do_produto`) que diz que existe, sem copiar os números. Se o trecho que sustenta um item contém um número de telefone, cite só a parte do trecho que sustenta o rótulo.
8. **As duas regras do modelo são sempre decididas e ditas**: `modelo.prende_equipamento` e `modelo.prazo_maximo_horas` (seção 3, "Regras do modelo"). Não deixe a decisão implícita no padrão.

## 1 Inventariar a entrada

1. Liste os arquivos. Para cada um, calcule o SHA-256 e conte as páginas:
   - PowerShell: `(Get-FileHash -Algorithm SHA256 <arq>).Hash.ToLower()`; Bash: `sha256sum <arq>`.
   - PDF: páginas com `python -c "import re,sys;print(len(re.findall(rb'/Type\s*/Page[^s]', open(sys.argv[1],'rb').read())))" <arq>` (aproximado; confira ao ler). Foto = 1 página.
2. Peça o **formulário em branco** se só houver preenchido; preenchido serve para inferir unidade e casas decimais, e nomes/CPF não entram no pacote.
3. Leia:
   - **PDF e imagens**: com a ferramenta Read (visão), página por página (`pages` em PDFs > 10 páginas). Leia caixas ☐/☑, grades S/N/NA e aninhamentos ("se sim, marque…") pela disposição visual.
   - **DOCX**: é um zip; o texto está em `word/document.xml` (`python -I -c "import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode())" <arq>`); tabelas em `<w:tbl>`, caixas em `w14:checkbox`/símbolos ☐.
   - **XLSX**: zip; `xl/sharedStrings.xml` + `xl/worksheets/sheet*.xml` (células mescladas em `<mergeCell>`). Página = planilha (1, 2, …) e diga isso em `observacao`.
   - **Docling** (opcional): se `python -c "import docling"` funcionar, `docling <arq> --to json` dá texto, tabelas e `bbox` por página; use o `bbox` em `origem.bbox`. Nunca exija Docling; nunca peça coordenadas "de cabeça".
4. Anote o idioma do documento (BCP 47: `pt-BR`, `en`, `es`…).

## 2 Extrair com fidelidade

Percorra o documento inteiro, de cima para baixo, e classifique **cada** bloco em uma de três saídas — nada fica sem destino:
- **item** do formulário (em uma seção de uma etapa);
- **campo do sistema** (`campos_do_sistema`): o que o app já guarda — nº da PT, local, equipamento/ativos, data, validade/janela, equipe, empresa, líder, escopo/descrição geral. Não vira item;
- **pendência**.

Para cada item registre: tipo, rótulo, obrigatório, unidade, casas decimais, faixa, negativo, respostas, o que impede, o que pede justificativa, condição ("mostrar quando"), anexos pedidos, e o trecho literal + página.

## 3 Mapear para o formato

### Regras do modelo (decida primeiro, antes das etapas)
Responda às três perguntas e escreva a resposta no pacote:

| Pergunta | Onde olhar no papel | O que escrever |
|---|---|---|
| Esta PT **é o serviço** no equipamento, ou **acompanha** a PT do serviço? | Título e finalidade. Desabilitação / bypass / inibição de intertravamento ou de dispositivo de segurança, liberação de proteção, "forçar" sinal: acompanha. Trabalho elétrico, a quente, em altura, espaço confinado, intervenção: é o serviço. | Acompanha → `"prende_equipamento": false`. É o serviço → `"prende_equipamento": true`. **Escreva o campo sempre**; não confie no padrão. Se o papel não deixa claro, escreva `true` e registre pendência com a pergunta ao cliente. |
| Há prazo máximo de validade? | "validade máxima", "prazo máximo", "não exceder", tabela de prazos | `prazo_maximo_horas` (horas). Prazos diferentes por caso: o maior + pendência (ver `padroes.md`). Sem prazo no papel: omita o campo. |
| Onde se aplica? | Cabeçalho, campo "área/equipamento", título | `escopo.tipos_de_local` / `tipos_de_ativo` só com nomes que o papel dá. Se o papel não diz, listas vazias + pendência "Escopo". |

O validador imprime a linha `Regras do modelo: …`: confira que ela diz o que você decidiu. Ele avisa quando o nome do modelo indica desabilitação e o campo `prende_equipamento` não foi escrito.

### Etapas e assinaturas
- Etapas fixas (`tipo`): `solicitacao` (primeira), depois etapas livres (sem `tipo`, ex.: "Preparação", "Inspeção conjunta"), depois `emissao` → `aceite_campo` → `entrega` → `aceite_area`. Etapa livre **depois** da Emissão não existe no produto: vira pendência.
- Etapa fixa que o papel não tem: omita; o importador a inclui e cria pendência.
- Cada bloco "nome / assinatura / data" = uma `assinatura` com `significado` curto no infinitivo da 3ª pessoa ("Emite a PT", "Verifica o isolamento"), `cargo` pelo **nome** como o papel diz (texto, ou lista quando vários cargos podem assinar), `minimo` (1 salvo indicação), `obrigatoria`.
- "Aprovação mínima" por nível (uma tabela de quem aprova cada classe): os cargos impressos para a classe **e** os dos níveis acima, que também aprovam; cite a tabela em `origem` e explique em `observacao`.
- Declaração impressa junto da assinatura ("Li e aceito…") vira item `aviso` em uma seção daquela etapa.
- "Não pode ser a mesma pessoa" → `separacoes` com as `ref` das duas assinaturas. Emissão ≠ Aceite no campo é do produto (o importador acrescenta).
- Assinatura "só quando…" ("Vigia, se houver espaço confinado") → `obrigatoria_quando: { item: <ref>, valores: [...] }` (com `linha` quando o item é verificação), a mesma regra de `mostrar_quando`, apontando para pergunta da mesma etapa ou de etapa anterior; a assinatura continua `obrigatoria: true`. O banco guarda a condição com a linha.
- `cargo: null` e assinatura sem significado ficam no **rascunho** (o banco aceita); a versão só ativa depois que uma pessoa escolhe o cargo e escreve o significado.
- Pessoa nomeada no papel, tabela de transferência de turno → pendência (`fora_do_produto`).

### Itens (`tipo`)
| Papel | Tipo | Configuração |
|---|---|---|
| Campo de escrever | `texto` | `longo` se várias linhas |
| Grade de opções (EPI, perigos, tipos de trabalho) | `marcacao` | `opcoes` próprias **ou** `lista` (nome, declarada em `listas`); `multipla`; `outro` se há "Outro: ___"; `impede: true` na opção que o papel proíbe ("não forçável", "não permitido") |
| Pergunta Sim/Não/NA, Sim/Não, ou "[ ] confirmo" | `verificacao` | `respostas` = `sim_nao_na` / `sim_nao` / `confirmo`; uma `linha` por pergunta; `impede: ["nao"]` só quando o papel diz que "Não" impede ("não prossiga", "obrigatório Sim") — se for só segurança óbvia, use `confianca: "media"` e diga em `observacao`; `justificar: ["na"]` quando pede "justifique/especifique" |
| Colunas de resposta que não são Sim/Não/NA (só "SIM" e "N.A.", "OK / Não OK / N.A.") | `verificacao` | `respostas: "lista"` + `lista_respostas: "<nome>"`, com a lista declarada em `listas` (itens = as colunas, como impressas: "SIM", "N.A."); `impede`/`justificar` com os **rótulos** desses itens, só quando o papel diz; não invente coluna que o papel não tem |
| Equipamento ou dispositivo escolhido de um catálogo da planta que ainda não veio (tags de intertravamento) | `marcacao` | `lista` declarada **sem itens** + pendência pedindo a lista ao cliente; a versão só ativa depois que a planta inclui os itens |
| Medição | `numero` | `unidade` em símbolo SI (tabela abaixo), `unidade_original` como escrita, `casas_decimais` = casas da faixa escrita ("19,5–23,5" → 1), `negativo`, `minimo`/`maximo` só do papel ("≥/mín." → minimo, "≤/máx." → maximo, "0 V"/"ausência de tensão" → 0 e 0) |
| Hora | `horario` | `segundos` se hh:mm:ss |
| Data ("__/__/____") | `data` | `nao_antes_de_hoje` se o papel diz ("não retroativa"); `minimo`/`maximo` (AAAA-MM-DD) só do papel |
| Referência a documento externo (Nº da APR, ART, OS, procedimento, PT de trabalho a quente nº) | `documento` | `formato` se o papel mostra o padrão ("APR-____" com 4 algarismos → `APR-####`; `#` algarismo, `A` letra); `anexo` se pede anexar; `validade` se pede validade/vencimento |
| Nome de pessoa (vigia, observador de incêndio, executantes, eletricista habilitado) | `pessoa` | `multipla` se há várias linhas de nome; `cargo` pelo nome quando o papel exige uma função; `deve_ser_elegivel` quando exige habilitação/autorização válida ("habilitado NR-10", "treinamento em dia") |
| Tabela de bloqueio/isolamento (ponto, tag, energia, cadeado, "energia zero") | `isolamento` | `minimo_linhas` (pontos que o papel exige; 1 se "ao menos um") |
| Tabela repetida (medições de gás por horário, leituras por fase) | `grupo` | `minimo_linhas` (linhas pré-impressas obrigatórias), `colunas`: um item por coluna, só `texto`/`numero`/`horario`/`marcacao`/`verificacao`, sem `mostrar_quando`; faixas das colunas `numero` como em Medição |
| "Anexar foto/arquivo" | `anexo` | `aceita` (`foto`/`video`/`arquivo`), `minimo`, `dica` |
| Texto impresso sem resposta | `aviso` | `texto` |

- Números do papel em pt-BR: "19,5" = 19.5; "1.000" = 1000. No JSON, número com ponto.
- Unidades canônicas: `%`, `% LIE` (LEL), `ppm`, `mg/m³`, `V`, `kV`, `mV`, `A`, `mA`, `kA`, `W`, `kW`, `Ω`, `MΩ`, `Hz`, `°C` ("graus"), `bar`, `kPa`, `MPa`, `Pa`, `m`, `cm`, `mm`, `m²`, `m³`, `L`, `kg`, `t`, `N`, `kN`, `s`, `min`, `h`, `lx`, `dB(A)`, `m/s`, `km/h`, `rpm`. Fora disso o validador avisa.
- Condição: `mostrar_quando: { item: <ref>, valores: [<rótulo da opção>] }` para marcação, ou `{ item, linha: <ref da linha>, valores: ["sim"|"nao"|"na"|"confirmo"] }` para verificação (com `respostas: "lista"`, os rótulos dos itens da lista). Só aponta para item **anterior**.
- Prazo máximo da janela ("validade máxima", "prazo máximo", "não pode exceder 7 dias"): `modelo.prazo_maximo_horas` (horas; 3 dias = 72). É um por modelo; se o papel tem prazos diferentes por caso (classe, tipo), use o maior e registre pendência dizendo que o limite por caso não é representado (o cliente pode separar em um modelo por caso).
- PT que convive com outra PT aberta no mesmo equipamento (desabilitação de intertravamento, bypass de dispositivo de segurança, que por natureza acompanha outra PT): `modelo.prende_equipamento: false`. Ausente = `true` (a regra é um equipamento, uma PT aberta). Só use `false` quando o papel deixa claro esse papel do formulário; na dúvida, registre pendência.
- `ref`: curto, único no pacote (`desc`, `o2`, `a_emi`). Linhas que são alvo de condição precisam de `ref`. O app troca as `ref` por ids próprios (uuid nas etapas e assinaturas).
- Tamanhos que o banco aceita: nome do modelo e de lista até 120, item de lista até 200, tipo de local/ativo e cargo até 80, nome de etapa até 80, significado até 120. `formato` do documento não pode ser só espaços.
- Datas em `minimo`/`maximo` precisam existir (AAAA-MM-DD; 30/02 é erro). Número com `minimo` maior que `maximo` é erro.
- Separação vale para as duas assinaturas, em qualquer ordem: o app guarda o par uma vez.
- `confianca: "baixa"` + `observacao` para o que leu com dúvida mas não é caso de pendência.

### Idioma
- `idioma: { documento: "<idioma do papel>", rotulos: "pt-BR" }`. O padrão de `rotulos` é **pt-BR**; use outro só se o usuário pedir.
- Se o documento não está no idioma dos rótulos, **traduza** rótulos, títulos, textos de aviso, opções, linhas e itens de lista para o português do Brasil com o vocabulário do app (Estado, Situação, Devolver, Pessoa indicada, Elegível, Remover; "Permit to Work" = PT; "Issuing Authority" = Emissão; "Performing Authority"/"Receipt" = Aceite no campo; "Hand back"/"Surrender" = Entrega; "Cancellation"/"Close out" = Aceite da área; "Y/N/NA" = Sim/Não/N/A; "PPE" = EPI).
- Guarde o texto do papel em `rotulo_original` (itens, linhas, opções, campos do sistema), `texto_original` (aviso), `titulo_original`, `nome_original`, `significado_original`, `itens_originais` (listas, mesma ordem). O validador compara **o original** com o `trecho` — por isso o original tem de ser literal.
- `trecho` fica **sempre** no idioma do documento. Corrija só erros de digitação evidentes no rótulo traduzido; nunca no trecho.

## 4 Escrever, validar, corrigir

1. Escreva `<nome-do-modelo>.ptw-modelo.json` ao lado do arquivo de origem (ou onde o usuário pedir). `origem.tipo: "documento"`, `arquivos` com nome, sha256 e páginas, `gerado_por: { ferramenta: "Claude Code · skill ptw-modelo-de-formulario", modelo: "<id do modelo em uso>", versao: "1" }`, `gerado_em` em ISO 8601.
2. Valide (Node ≥ 22.18 roda TypeScript direto; dentro de `ptw-mockup-v2`):
   ```
   node scripts/validar-modelo.ts <arquivo.ptw-modelo.json>
   node scripts/validar-modelo.ts <arquivo> --cadastro <cadastro.json>   # se a planta forneceu cargos/tipos/listas
   ```
   Sem cadastro, cargos não são conferidos (aparecem "não conferido"). Código de saída 1 = há erro.
3. Corrija **erros** e rode de novo até sair 0. Um erro "não aparece no trecho citado" quer dizer: corrija o trecho (copie o texto exato) ou remova o item se ele não está no papel — nunca altere o trecho para caber no rótulo. Avisos e pendências podem ficar.
4. Releia o documento uma última vez procurando o que **não** virou item, campo do sistema nem pendência. Itens críticos (linhas que impedem, medições com faixa, assinaturas e separações, condições que exigem itens) não podem faltar.
5. Passe a lista de conferência abaixo, item por item. Só relate depois de marcar todos.

### Lista de conferência (obrigatória)
- [ ] O validador saiu com código 0 e eu li **todos** os avisos; cada aviso ou foi resolvido ou tem uma pendência que o explica.
- [ ] A linha `Regras do modelo` do validador bate com o que decidi; `prende_equipamento` está escrito no pacote.
- [ ] Contei os blocos de assinatura do papel e o número bate com `Assinaturas` do validador (mais as que o produto acrescenta, que aparecem como pendência).
- [ ] Toda caixa de marcar, toda coluna de resposta e toda linha de tabela do papel está em um item, um campo do sistema ou uma pendência.
- [ ] Nenhum número de faixa, cargo, opção ou linha que eu não consiga apontar no papel com o dedo.
- [ ] Nenhum nome de pessoa, telefone, ramal, e-mail ou matrícula em lugar nenhum do arquivo (procure por dígitos em sequência e por "@").
- [ ] Toda lista declarada sem itens tem a pendência que pede os itens ao cliente.
- [ ] Toda condição (`mostrar_quando`, `obrigatoria_quando`) aponta para item anterior e usa os rótulos exatos das opções.
- [ ] `gerado_por.modelo` é o id do modelo que está rodando agora, e `gerado_em` é a hora de agora.

## 5 Relatar ao usuário

Em poucas linhas, em português:
- arquivo gerado (caminho completo) e resultado do validador;
- etapas, assinaturas (com cargos), seções, itens por tipo, linhas de verificação, campos do sistema;
- as regras do modelo que você decidiu (prende ou não o equipamento, prazo máximo, escopo) e por quê, em uma linha cada;
- pendências, uma por linha, começando pelas que impedem ativar (lista vazia, assinatura sem cargo, escopo vazio);
- **lembrete**: importar no app (Configuração › Modelos), revisar item a item contra o papel, resolver as pendências e só então uma pessoa **ativa** a versão. O pacote nunca ativa nada.

`modelo.politica_eletrica` é extensão opcional para preservar os controles NR-10 de um modelo existente: base `vigente2019`/`preparacao2027`, refs documentais, classificação, sequências e turno. Não inferir política nem procedimento técnico de informações ausentes no documento. O pacote sempre importa como rascunho sujeito à revisão humana.
