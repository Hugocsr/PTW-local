// Verificação operacional de conteúdo, em fluxo e com a credencial restrita da API.
import { createHash } from 'node:crypto'
import { loadConfig } from '../dist/config.js'
import { Db, postgresDriver } from '../dist/db.js'
import { S3 } from '../dist/storage/s3.js'

const config=loadConfig(), db=new Db(postgresDriver(config.db)), s3=new S3(config.storageUrl)
try {
  const unitId=await db.unitByCode(config.unit)
  if(!unitId) throw new Error('Unidade não encontrada')
  const context={unitId,personId:null,auth:'sistema',client:'verificar-arquivos'}
  let last='', files=0, bytes=0
  while(true) {
    const rows=await db.withContext(context,tx=>tx`select encode(sha256,'hex') as sha,size,object_key from ptw.blob
      where unit_id=ptw.current_unit() and encode(sha256,'hex')>${last} order by sha256 limit 100`)
    if(!rows.length) break
    for(const row of rows) {
      const response=await s3.request('GET',row.object_key)
      if(!response.ok || !response.body) throw new Error('Arquivo indisponível: '+row.sha)
      const hash=createHash('sha256'); let size=0
      for await(const chunk of response.body) { hash.update(chunk); size+=chunk.byteLength }
      if(hash.digest('hex')!==row.sha || size!==Number(row.size)) throw new Error('Arquivo divergente: '+row.sha)
      files++; bytes+=size; last=row.sha
    }
  }
  await db.withContext(context,tx=>tx`select ptw.audit_system('sistema.arquivos.verificados','Conteúdo de todos os arquivos conferido',${JSON.stringify({arquivos:files,bytes})}::jsonb)`)
  console.log(JSON.stringify({files,bytes,result:'integro'}))
} finally { await db.end() }
