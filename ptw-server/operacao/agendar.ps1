param(
  [Parameter(Mandatory=$true)][string]$Backups,
  [Parameter(Mandatory=$true)][string]$Ancoras,
  [string]$Python = (Get-Command python -ErrorAction Stop).Source
)
$ErrorActionPreference = 'Stop'
$PtwServer = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PtwScript = Join-Path $PtwServer 'tools\ptw_operacao.py'
foreach ($PtwPath in @($Backups,$Ancoras,$Python,$PtwScript)) {
  if ($PtwPath.Contains('"')) { throw 'Aspas não são permitidas nos caminhos.' }
}
$PtwArgs = '"{0}" ciclo --destino "{1}" --ancoras "{2}"' -f $PtwScript,$Backups,$Ancoras
$PtwAction = New-ScheduledTaskAction -Execute $Python -Argument $PtwArgs -WorkingDirectory $PtwServer
$PtwTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$PtwSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$PtwPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'PTW operacao' -Action $PtwAction -Trigger $PtwTrigger -Settings $PtwSettings -Principal $PtwPrincipal -Force
Write-Output 'Agendamento criado para a sessão deste usuário. Docker Desktop precisa estar ligado.'
