# SPEC 012: Retenção da trilha: finalidade e posição na configuração da versão

| | |
|---|---|
| Status | **Investigação concluída, aguardando decisão** |
| Autor | Claude (Cowork), a partir do requisito de Hugo Silva |
| Data | 26/11/2026 |
| Onde aparece | Modelos de PT › (um modelo): campo **"Retenção da trilha"** acima da tabela de versões |

## 1. Resposta curta

- **Finalidade:** o campo diz **por quanto tempo a trilha de auditoria das PTs deste modelo é guardada**. É a *classe de retenção* (`ptw.retention_class`), uma exigência de guarda de registros (por exemplo, a PET de espaço confinado, NR-33, fica arquivada por 5 anos).
- **Não é o Tipo de Trabalho.** O campo não tem relação com o que se faz no serviço (elétrica, altura, soldagem). "Tipos de trabalho" é outra coisa: uma **lista de opções** do catálogo (`#catalogos`), usada como pergunta de marcação dentro do formulário de alguns modelos.
- **Por isso o ajuste 3 do pedido não se aplica** ("exibir as opções da lista de Tipos de Trabalho"): as opções do campo são as 3 classes de retenção, que vêm de uma tabela do sistema, não da lista de Tipos de Trabalho.
- **Hoje ele está no lugar errado para o que se pede:** é um dado do **modelo** (vale para todas as versões), editável **a qualquer momento**, mesmo com versão ativa e PTs em andamento. Os demais campos de configuração (Escopo, prazo máximo da janela, "Prende o equipamento") ficam na **versão** e congelam quando ela é ativada.
- **E ele ainda não tem efeito prático:** a guarda real da trilha é sempre o **maior** prazo entre as classes (hoje 5 anos nas três), porque uma partição mensal mistura PTs de modelos diferentes. Escolher "PET" ou "PT" não muda nada além do que a tela mostra.

## 2. Como funciona hoje

| Camada | Onde | O quê |
|---|---|---|
| **Banco** | `db/schema/20_modelos.sql` › `ptw.retention_class` | 3 classes fixas (`code`, `label`, `years` ≥ 5, `basis`): `pet`, `pt`, `cadastro`. Só o dono do banco altera; cada mudança vira o evento `sistema.retencao.alterada`. |
| **Banco** | `ptw.template.retention_class` | Coluna **do modelo**, padrão `pt`, FK para a tabela acima. |
| **Banco** | `50_auditoria.sql` › `audit_retention_years()` | `max(years)` de **todas** as classes. É esse prazo que libera o arquivamento da partição (`audit_archive`). A classe do modelo **não entra** na conta. |
| **API** | `POST /templates`, `PATCH /templates/{id}` (If-Match) | Recebem e devolvem `retentionClass`. |
| **App** | `TemplatesView/ModelDetail.tsx` (linhas 53 e 220-228) | `Select` "Retenção da trilha" com as 3 opções e a nota "Guardada por no mínimo 5 anos (PET: NR-33)". Quem não tem o papel `modelos` vê só o texto. |
| **App** | `core/templateVersions.ts` (linha 186) | Só confere que a classe é uma das três. |
| **Importação** | `ptw.modelo/1` | O pacote **não** traz a classe: o modelo importado nasce com `pt`. |

As três opções hoje, com o texto da tela:

| Código | Texto | Anos |
|---|---|---|
| `pet` | PET: entrada em espaço confinado | 5 |
| `pt` | PT de trabalho (elétrica, altura, geral) | 5 |
| `cadastro` | Cadastro, modelos, acessos e eventos do sistema | 5 |

A terceira descreve **eventos do sistema**, não uma PT: não faz sentido como classe de um **modelo de PT**.

## 3. Por que "mover para a versão" pede uma decisão

A configuração de uma versão (Escopo · Fluxo · Testar) vive em `ptw.template_version`, e o gatilho `version_guard` já garante o que o pedido quer: **rascunho edita, ativa/arquivada não**. Mas a retenção hoje é coluna do **modelo**. Há dois caminhos:

| | **A. Passa a ser da versão** (recomendado) | **B. Continua do modelo, só muda a tela** |
|---|---|---|
| Onde fica o dado | Nova coluna `template_version.retention_class` | Continua em `template.retention_class` |
| Edição só no rascunho | **Garantida pelo banco** (`version_guard`), igual ao prazo e ao "Prende o equipamento" | Só a tela esconderia o campo; a API/banco aceitariam a alteração a qualquer hora |
| Cada versão pode ter a sua | Sim; a PT herda a classe da versão que a gerou | Não: uma classe para o modelo todo |
| Histórico | A versão ativa **congela** a classe; PTs antigas continuam com a que valeu | Mudar o modelo muda, retroativamente, o que a tela diz de PTs antigas |
| Custo | Mudança de banco (coluna + cópia do valor do modelo para cada versão + remover a coluna do modelo), contrato, API, importação e **script de atualização do Supabase** | Só tela |

**Recomendação: A.** É o único caminho que cumpre "alterar só enquanto Rascunho" de verdade (no banco, não só na tela) e deixa a classe congelada com a versão, como o resto da configuração.

## 4. Escopo (se A for aprovado)

**Entra**
1. **Banco:** `template_version.retention_class` (`text not null default 'pt'`, FK para `ptw.retention_class`). Migração: cada versão existente recebe a classe do modelo; depois `template.retention_class` é removida (uma fonte só). `version_guard` já congela a coluna na ativa/arquivada.
2. **API:** `retentionClass` passa do `Template` para a `TemplateVersion` (leitura, criação e atualização de rascunho). `POST/PATCH /templates` deixam de receber o campo. `openapi.yaml` e `schema.d.ts` regenerados.
3. **App:** o campo sai do cabeçalho do modelo e entra na **configuração da versão**, na aba **Escopo** (junto de "Prazo máximo" e "Prende o equipamento"):
   - rascunho: `Select` editável;
   - versão ativa ou arquivada: **texto somente leitura**, como os demais campos congelados;
   - sem o papel `modelos`: texto somente leitura.
4. **Nova versão** (copiar da ativa) herda a classe da versão de origem.
5. **Importação:** versão importada nasce com `pt` (como hoje). O pacote `ptw.modelo/1` não muda.
6. **Auditoria:** a alteração no rascunho entra como mudança da versão (campo "classe de retenção", que já tem nome legível).
7. Testes, `DESIGN.md`, `ptw-server/db/MODELO.md` e script de atualização do banco hospedado.

**Não entra**
- Mudar as classes, os anos ou a regra de arquivamento (`audit_retention_years`, `audit_archive`).
- Criar um campo "Tipo de trabalho" na versão (ver decisão 4).
- Mudar o formato do pacote de importação.

## 5. Comportamento esperado

- **Modelos de PT › modelo:** o cabeçalho não tem mais "Retenção da trilha".
- **Versão em rascunho › Escopo:** o campo aparece com as opções e a nota de mínimo de 5 anos; a troca é salva como as demais alterações do rascunho.
- **Versão ativa ou arquivada › Escopo:** o campo aparece só como texto. Nenhuma forma de editar, na tela ou pela API (a API devolve o erro do banco `PTW03`, "Versão ativa não pode ser alterada").
- **Nova versão:** nasce como rascunho com a mesma classe da versão copiada.
- **Quem só lê (sem `modelos`):** vê a classe da versão, sem controle.

## 6. Pontos para decisão

1. **Caminho A (da versão) ou B (só tela)?**
   - **Proposta:** A, pelo que a seção 3 mostra.
2. **A opção "Cadastro, modelos, acessos e eventos do sistema" deve continuar na lista de um modelo de PT?** Ela descreve eventos do sistema, não PTs.
   - **Proposta:** mostrar só **PET** e **PT de trabalho** na versão (a classe `cadastro` continua existindo no banco para o sistema).
3. **Valor padrão de versões novas e importadas:** `pt` (como hoje).
   - **Proposta:** manter.
4. **Tipo de Trabalho:** o pedido sugere que o campo poderia ser isso; não é. Se a operação quer **classificar a versão por tipo de trabalho** (elétrica, altura, espaço confinado…) com as opções da lista cadastrada, isso é um campo novo e outra spec.
   - **Proposta:** não criar agora; o campo de retenção fica com o nome e a finalidade atuais.
5. **Rótulo:** o campo hoje se chama "Retenção da trilha" (o pedido cita "Retenção de trilha").
   - **Proposta:** manter "Retenção da trilha", com ⓘ explicando "por quanto tempo a trilha de auditoria das PTs desta versão é guardada".

## 7. Plano de testes

| Caso | O que conferir |
|---|---|
| CT-01 | Cabeçalho do modelo sem o campo; aba Escopo da versão em rascunho com o campo e as opções decididas. |
| CT-02 | Trocar a classe no rascunho: salva, recarregar mantém, auditoria mostra "classe de retenção" de→para. |
| CT-03 | Versão ativa e arquivada: campo em texto, sem controle. |
| CT-04 | API: `PATCH` da classe em versão ativa → 4xx com `PTW03`; em rascunho → 200; classe inexistente → erro de FK. |
| CT-05 | Nova versão a partir da ativa herda a classe; importação cria rascunho com `pt`. |
| CT-06 | Migração: modelo com classe `pet` e 3 versões → as 3 versões ficam `pet`; coluna do modelo removida; nada de PT muda. |
| CT-07 | Sem o papel `modelos`: texto somente leitura. |
| CT-08 | 390/768/1024/1440 px sem rolagem lateral; `npm run check` e testes da API limpos; contrato sincronizado (`sync-shared --check`). |

## 8. Como entregar

- **Se A:** mudança de banco. Atualização do esquema do Supabase por script (cópia do valor do modelo para as versões, depois remoção da coluna), `docker compose ... up -d --build --wait` na pasta `ptw-server`, Ctrl+F5 e push.
- **Se B:** só front-end.
