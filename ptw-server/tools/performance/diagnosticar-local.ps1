$ErrorActionPreference = 'Stop'
$server = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$report = [IO.Path]::GetFullPath((Join-Path $server '../../outputs/perf01/conectividade-local.txt'))
$probe = @'
import net from 'node:net';
import {loadConfig} from './dist/config.js';
import {postgresDriver} from './dist/db.js';
const c=loadConfig();
console.log(JSON.stringify({host:c.db.host,port:c.db.port,database:c.db.database,pool:c.db.max,tls:c.db.tls,prepare:c.db.prepare}));
await new Promise(resolve=>{const s=net.connect({host:c.db.host,port:c.db.port});s.setTimeout(3000);s.on('connect',()=>{console.log('TCP conectado');s.end();resolve()});s.on('timeout',()=>{console.log('TCP timeout');s.destroy();resolve()});s.on('error',e=>{console.log('TCP erro '+e.code);resolve()})});
const d=postgresDriver(c.db);
try{const rows=await d.begin(tx=>tx`select current_database() as database,current_user as role`);console.log(JSON.stringify(rows))}catch(e){console.log(JSON.stringify({postgresError:e.code,message:e.message?.split('\n')[0]}))}finally{await d.end()}
'@
Push-Location $server
try {
    $lines = @()
    $lines += & docker compose ps --format json
    $lines += & docker compose exec -T db pg_isready -U ptw_owner
    $lines += & docker inspect ptw-api-1 --format '{{json .NetworkSettings.Networks}}'
    $lines += & docker inspect ptw-db-1 --format '{{json .NetworkSettings.Networks}}'
    $lines += & docker compose exec -T api node --input-type=module -e $probe
    $lines | Set-Content -LiteralPath $report -Encoding UTF8
    Write-Host "Diagnóstico salvo em $report"
} finally { Pop-Location }
