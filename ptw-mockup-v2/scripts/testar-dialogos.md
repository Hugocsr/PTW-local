# Regressão dos diálogos de PT

`testar-dialogos.cjs` executa Playwright contra o app e o LDAP do laboratório. Precisa do cadastro/modelos de exemplo e dos logins `marina.costa` e `rafael.nunes` ativos. Não execute com credenciais da planta.

O navegador recebe uma PT e um ativo fictícios pelas rotas interceptadas. Todas as escritas dessa PT, inclusive o registro de acesso, são respondidas pelo teste; nenhum ato da PT é enviado ao banco. Login e consultas de cadastro usam o servidor local. O cenário verifica a interface; o ciclo real de PT está documentado em `fabrica/testes-feedback-2026-11-10.md`.

## Executar

Suba o laboratório em `ptw-server/`:

```sh
docker compose -f compose.yaml -f compose.ldap-test.yaml up -d --build
```

Em `ptw-mockup-v2/`, com o pacote `playwright` e seu Chromium disponíveis:

```sh
node scripts/testar-dialogos.cjs
```

Se o Playwright estiver instalado fora do projeto, defina `PTW_TEST_PLAYWRIGHT` com o caminho absoluto do módulo `playwright` ou `playwright-core`. `PTW_TEST_CHROMIUM` permite usar um executável Chromium já instalado. O script usa o navegador padrão do Playwright quando essa variável está ausente.

Opções:

| Variável | Padrão / finalidade |
|---|---|
| `PTW_TEST_URL` | `https://localhost`; aceita também o Vite com o proxy da API |
| `PTW_TEST_OUTPUT` | `ptw-testes-dialogos` na pasta temporária do sistema; capturas, traces e resultado JSON |
| `PTW_TEST_PASSWORD` | Senha pública exclusivamente do laboratório: `Teste-local-2026!` |
| `PTW_TEST_CASES` | `retomar,prorrogar,parar,enviar,devolver`; restringe a rodada quando necessário |
| `PTW_TEST_SESSIONS` | Opcional: JSON de estados Playwright (`storageState`) por login, para reutilizar sessões de teste ainda válidas. Contém cookies: manter fora do repositório. |

Uma rodada autentica cada pessoa apenas uma vez e reutiliza a sessão nos seus casos. O bloqueio de tentativas do servidor continua valendo: se a entrada responder 429, o teste informa o prazo de espera e encerra, sem repetir tentativas nem zerar contadores.

## O que confere

Cinco atos, nas larguras 390, 768, 1024 e 1440 px, com o mesmo diálogo aberto enquanto a largura muda:

- Durante a requisição pendente: dados preservados, fechamento e repetição bloqueados, sem sucesso antecipado. Faz captura de página inteira e confere o estado novamente depois dela.
- Depois da recusa controlada: alerta persistente, dados e motivo de parada preservados, botão novamente disponível, nenhuma rolagem horizontal.
- Ao cancelar e reabrir: formulário novo, sem reaproveitar o erro ou o motivo anterior.
- Em Prorrogar: data/hora incompletas continuam visíveis ao redimensionar e impedem a confirmação; corrigir o campo volta a habilitar a ação.

São **40 cenários** de espera/recusa, além da reabertura de cada diálogo e quatro verificações de campos incompletos. O processo termina com código diferente de zero se qualquer asserção falhar. `resultado.json` inclui os eventos reais de resize/media query; os arquivos `*-trace.zip` podem ser abertos no Trace Viewer do Playwright. As evidências deste teste contêm apenas os dados fictícios do laboratório.
