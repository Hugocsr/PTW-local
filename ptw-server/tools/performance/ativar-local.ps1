param([switch]$Desativar)
$ErrorActionPreference = 'Stop'
$server = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$repository = [IO.Path]::GetFullPath((Join-Path $server '..'))
$evidence = [IO.Path]::GetFullPath((Join-Path $repository '../outputs/perf01'))
[IO.Directory]::CreateDirectory($evidence) | Out-Null
$selected = $env:COMPOSE_FILE
if (-not $selected) {
    $settings = Join-Path $server '.env'
    if (Test-Path -LiteralPath $settings) {
        $line = Get-Content -LiteralPath $settings | Where-Object { $_ -match '^COMPOSE_FILE=' } | Select-Object -First 1
        if ($line) { $selected = $line.Substring('COMPOSE_FILE='.Length).Trim('"').Trim("'") }
    }
}
if (-not $selected) { throw 'COMPOSE_FILE da instalação não foi identificado. Informe a composição atual; o script não escolherá outra instalação.' }
$override = Join-Path $evidence 'compose-performance.json'
$enabled = if ($Desativar) { '0' } else { '1' }
@{ services = @{ api = @{ environment = @{ PTW_PERF = $enabled; PTW_PERF_SAMPLE_RATE = '1'; PTW_RUNTIME_REGION = 'local-docker' } } } } |
    ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $override -Encoding UTF8
$previous = $env:COMPOSE_FILE
try {
    $env:COMPOSE_FILE = "$selected;$override"
    Push-Location $server
    try {
        & docker version --format '{{.Server.Version}}'
        if ($LASTEXITCODE -ne 0) { throw 'Docker não está acessível por esta conta.' }
        Write-Host 'Construindo API e frontend; a instalação atual continua em execução durante o build.'
        & docker compose build api web
        if ($LASTEXITCODE -ne 0) { throw 'Build recusado. A versão anterior não foi substituída.' }
        & docker compose up -d --no-deps --wait api web
        if ($LASTEXITCODE -ne 0) { throw 'Confira os serviços api/web. Banco, arquivos e volumes não foram recriados pelo script.' }
        Write-Host "Instrumentação PTW_PERF=$enabled aplicada em https://localhost. Banco e volumes preservados."
        Write-Host "Override temporário: $override"
    } finally { Pop-Location }
} finally { $env:COMPOSE_FILE = $previous }
