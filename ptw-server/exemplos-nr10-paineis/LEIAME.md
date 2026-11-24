# Cenário NR-10 — painéis elétricos Actemium (PTW Local)

## Arquivos

- `pt-eletrica-nr10-paineis.ptw-modelo.json`: modelo de PT, no pacote `ptw.modelo/1`. Para usar, vá em Modelos de PT › Importar modelo, revise a prévia e ative a versão.
- `modelo-pt-nr10-paineis-especificacao.md`: base do modelo (itens da NR-10 e linha de painéis Actemium). Cada campo do pacote cita a linha deste documento de onde veio.
- `nr10-flow.js`: script de ensaio, roda no console da página do PTW. Tem três partes:
  - `NR10.setup`: cria as áreas, os equipamentos, a alimentação e os cargos da equipe.
  - `NR10.flow`: leva uma PT do rascunho ao encerramento.
  - `NR10.negatives`: confere três recusas.

## Cadastro criado (Planta Norte)

| Área | Equipamentos |
|---|---|
| PNO-SE01 · Subestação principal SE-01 (13,8 kV) | QGMT-01 painel MT PA4, com os cubículos aninhados E1 e S1; TR-01 transformador 13,8/0,48 kV de 2.000 kVA; QGBT-01 CDC CM4 de 480 V |
| PNO-ELC02 · Eletrocentro E-02 | CCM-02 CCM CM4, com as gavetas aninhadas 2A, 3B e 4C; PINV-01 inversores; PCLP-01 CLP; RET-01 retificador de 125 Vcc; QDL-01 iluminação |

Alimentação cadastrada: QGMT-01-S1 → TR-01 → QGBT-01 → CCM-02, PINV-01, RET-01, QDL-01 e PCLP-01. A gaveta 2A alimenta o motor M-201 da BP-201.

## Modelo

As seis etapas do modelo:

1. **Solicitação** (Técnico): OS; procedimento, APR e autorizações NR-10, com anexo e validade; classificação; medidas de controle.
2. **Desenergização 10.5.1**: executada pelo Eletricista autorizado e conferida pelo Líder, que precisa ser outra pessoa. Inclui os pontos de bloqueio, os passos a) a f) na ordem e a tensão medida igual a 0 V.
3. **Emissão** (Supervisora): conferência e foto do bloqueio.
4. **Aceite no campo** (Líder).
5. **Entrega** (Líder).
6. **Reenergização 10.5.2** (Supervisora): os passos a) a e) na ordem.

Regras do modelo:

- A janela da PT tem no máximo 12 horas.
- A equipe NR-10 é obrigatória.
- Quem emite não pode ser quem aceita no campo.
- Trabalho em instalação energizada não é coberto por este modelo.

## Pessoas do ensaio

- Sérgio e Paulo: Eletricista autorizado (NR-10) na Planta Norte.
- Paulo e Beatriz: Líder de equipe na Planta Norte.

## Resultado do ensaio em 24/11/2026

A PT PT-UN01-2026-00001 passou por Rafael, Sérgio, Beatriz, Marina, Paulo e Joana e terminou encerrada. A cadeia de auditoria foi verificada e está íntegra.

As três recusas esperadas aconteceram:

- Janela de 13 h: recusada (PTW31).
- Passo c) respondido antes do a): recusado (PTW34).
- Envio sem equipe e sem documentos: recusado (PTW34).

Os PDFs e a foto anexados à PT são arquivos de teste, gerados pelo script.
