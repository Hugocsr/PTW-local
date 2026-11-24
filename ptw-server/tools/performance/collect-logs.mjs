import { readFileSync, writeFileSync } from 'node:fs'
import { distribution } from './stats.mjs'

// This export deliberately projects fields instead of spreading raw log objects.
export function performanceRecords(input) {
  const records=[]
  const token=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(value)?value:'unknown'
  for(const line of input.split(/\r?\n/)){
    try{
      const row=JSON.parse(line.slice(line.indexOf('{')))
      if(row.event==='ptw.performance.request'){
        const record={event:row.event,requestId:token(row.requestId),instance:token(row.instance),deploy:token(row.deploy),commit:token(row.commit),region:token(row.region),operation:token(row.operation),stream:row.stream===true}
        for(const key of ['status','totalMs','authMs','transactions','transactionFailures','transactionMs','beginToCallbackMs','queries','queryRoundtripMs','queryFailures'])record[key]=typeof row[key]==='number'&&Number.isFinite(row[key])?row[key]:null
        records.push(record)
      }else if(['ptw.performance.lifecycle','ptw.performance.startup'].includes(row.event)){
        records.push({event:row.event,instance:token(row.instance),stage:token(row.stage),elapsedMs:typeof row.elapsedMs==='number'?row.elapsedMs:null})
      }
    }catch{ /* Ignore non-JSON and unrelated application logs. */ }
  }
  return records
}

if(process.argv[1]?.endsWith('collect-logs.mjs')){
  const input=process.argv[process.argv.indexOf('--input')+1],output=process.argv[process.argv.indexOf('--output')+1]
  if(!process.argv.includes('--input')||!process.argv.includes('--output'))throw Error('Use --input PRIVATE-LOG.txt --output SANITIZED.json')
  const records=performanceRecords(readFileSync(input,'utf8'))
  const requests=records.filter(r=>r.event==='ptw.performance.request'&&!r.stream)
  const summary=Object.fromEntries([...new Set(requests.map(r=>r.operation))].map(op=>[op,distribution(requests.filter(r=>r.operation===op).map(r=>r.totalMs))]))
  writeFileSync(output,JSON.stringify({collectedAt:new Date().toISOString(),summary,records},null,2))
  console.log(`${records.length} registros de desempenho; nenhum log bruto foi copiado.`)
}
