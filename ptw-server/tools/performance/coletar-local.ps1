param([int]$Amostras = 20)
$ErrorActionPreference = 'Stop'
$server = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$repository = [IO.Path]::GetFullPath((Join-Path $server '..'))
$evidence = [IO.Path]::GetFullPath((Join-Path $repository '../outputs/perf01'))
$privateEnv = Join-Path $evidence 'local.env'
$playwright = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
if (-not (Test-Path -LiteralPath $privateEnv)) { throw "Credenciais privadas ausentes: $privateEnv" }
if (-not (Test-Path -LiteralPath $playwright)) { throw 'Playwright não encontrado no runtime local. Informe uma instalação disponível antes de coletar.' }
$report = Join-Path $evidence 'baseline-local.json'
$logs = Join-Path $evidence 'api-local-private.log'
$sanitized = Join-Path $evidence 'api-local-timings.json'
$since = [DateTime]::UtcNow.ToString('o')
Push-Location $repository
try {
    & node (Join-Path $PSScriptRoot 'collect-browser.mjs') --base https://localhost --environment local --env-file $privateEnv --output $report --playwright-entry $playwright --samples $Amostras --concurrency 1,4 --client-metrics 1
    $browserResult = $LASTEXITCODE
    Push-Location $server
    try {
        & docker compose logs --no-color --since $since api | Set-Content -LiteralPath $logs -Encoding UTF8
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair logs locais; relatório do navegador foi preservado.' }
    } finally { Pop-Location }
    & node (Join-Path $PSScriptRoot 'collect-logs.mjs') --input $logs --output $sanitized
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao sanitizar os logs; não compartilhe o arquivo bruto.' }
    if ($browserResult -ne 0) { throw "A coleta encontrou falha; evidências sanitizadas preservadas em $evidence" }
    Write-Host "Coleta local concluída: $report"
    Write-Host "Métricas da API: $sanitized"
    Write-Host 'Não altera banco, volumes, região, pools ou configuração dos serviços.'
} finally { Pop-Location }
