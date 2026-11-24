import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { grouped } from './stats.mjs'

const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,arg,i,all)=>arg.startsWith('--')?[...pairs,[arg.slice(2),all[i+1]]]:pairs,[]))
if(args.help){console.log('node collect-browser.mjs --base https://localhost --environment local --env-file PRIVATE.env --output ABSOLUTE.json --playwright-entry ABSOLUTE/index.mjs [--samples 20] [--concurrency 1,4] [--client-metrics 1] [--pause-ms 0]');process.exit(0)}
if(args['env-file'])process.loadEnvFile(resolve(args['env-file']))
const base=new URL(args.base??'https://localhost')
const environment=args.environment??'local'
if(base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('Base must be an origin without credentials or query')
const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname)
if(environment==='local'?!local:environment!=='preview'||base.origin!=='https://ptw-git-ptw-sgi-hc-4634.vercel.app')throw Error('Target outside the approved local/Preview scope')
if(!local&&base.protocol!=='https:')throw Error('Preview requires HTTPS')
const output=resolve(args.output??'performance.json')
const repo=resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const relativeOutput=relative(repo,output)
if(!relativeOutput.startsWith('..')&&!isAbsolute(relativeOutput))throw Error('Evidence output must be outside the repository')
const samples=Number(args.samples??20)
const concurrencies=(args.concurrency??'1,4').split(',').map(Number)
if(!Number.isInteger(samples)||samples<1||samples>40||concurrencies.some(n=>![1,4].includes(n)))throw Error('Use 1..40 samples and concurrency 1,4')
const pause=Number(args['pause-ms']??0)
if(!Number.isFinite(pause)||pause<0)throw Error('Invalid pause')
const users=process.env.PTW_PERF_USERS_JSON?JSON.parse(process.env.PTW_PERF_USERS_JSON):[
 {login:'marina.costa',password:process.env.PTW_PREVIEW_LOGIN_PASSWORD},
 ...Object.entries(JSON.parse(process.env.PTW_PREVIEW_USERS_JSON??'{}')).map(([login,password])=>({login,password})),
]
if(users.length<1||users.some(u=>!u.login||!u.password))throw Error('Define private PTW_PERF_USERS_JSON with login/password entries')
if(concurrencies.includes(4)&&users.length<3)throw Error('Four-session collection requires the three distinct test accounts')
const entry=args['playwright-entry']??process.env.PTW_PLAYWRIGHT_ENTRY
if(!entry)throw Error('Specify --playwright-entry; do not install dependencies implicitly')
const {chromium}=await import(pathToFileURL(resolve(entry)).href)
const browser=await chromium.launch({headless:true,channel:'chrome'})
let commit='unknown',dirty=true
try{const git=(...a)=>execFileSync('git',['-c',`safe.directory=${repo.replaceAll('\\','/')}`,'-C',repo,...a],{encoding:'utf8'}).trim();commit=git('rev-parse','HEAD');dirty=Boolean(git('status','--porcelain'))}catch{}
const results=[],network=[],client=[],errors=[]
const metadata={environment,origin:base.origin,collectedAt:new Date().toISOString(),sourceCommit:args.commit??commit,workingTree:dirty,samplesRequested:samples,concurrencies,clientMetrics:args['client-metrics']==='1',percentile:'nearest-rank',browser:'Chrome',viewport:{width:1440,height:1000}}
const persist=()=>{mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({metadata,summary:grouped(results.filter(r=>r.iteration>=0)),firstObserved:grouped(results.filter(r=>r.iteration<0)),samples:results,network,client,errors},null,2))}
try{
 for(const concurrency of concurrencies){
  let next=0
  await Promise.all(Array.from({length:concurrency},async(_,worker)=>{
   const user=users[worker%users.length]
   const headers=!local&&process.env.PTW_TEST_VERCEL_BYPASS?{'x-vercel-protection-bypass':process.env.PTW_TEST_VERCEL_BYPASS}:{}
   const context=await browser.newContext({viewport:metadata.viewport,extraHTTPHeaders:headers})
   await context.exposeBinding('__ptwPerf',(_source,event)=>{client.push({concurrency,worker,...event})})
   await context.addInitScript(enabled=>{
    if(enabled)sessionStorage.setItem('ptw.performance','1');else sessionStorage.removeItem('ptw.performance')
    window.addEventListener('ptw:performance',e=>window.__ptwPerf(e.detail))
   },metadata.clientMetrics)
   const page=await context.newPage();page.setDefaultTimeout(60000)
   const pending=new Set(),requestPhase=new Map();let scenario='initial',iteration=-1
   page.on('pageerror',()=>errors.push({concurrency,worker,scenario,kind:'javascript'}))
   page.on('response',response=>{
    const request=response.request(),phase=requestPhase.get(request)??{scenario,iteration}
    if(response.url().startsWith(base.origin+'/api/')&&response.status()>=400&&['login','reload','modelos','ativos','quadro'].includes(phase.scenario))errors.push({concurrency,worker,...phase,kind:'http',status:response.status()})
   })
   page.on('request',request=>{requestPhase.set(request,{scenario,iteration});if(new URL(request.url()).pathname.startsWith('/api/')&&!/\/(events|status|health)$/.test(new URL(request.url()).pathname))pending.add(request)})
   const finish=async(request,failed=false)=>{
    pending.delete(request)
    const phase=requestPhase.get(request)??{scenario,iteration};requestPhase.delete(request)
    if(!request.url().startsWith(base.origin+'/api/'))return
    const response=failed?null:await request.response()
    const requestId=request.headers()['x-request-id']??response?.headers()['x-request-id']??null
    const normalized=new URL(request.url()).pathname.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,':id')
    const timing=request.timing();const sizes=failed?{}:await request.sizes().catch(()=>({}))
    network.push({concurrency,worker,...phase,requestId:requestId&&(/^(ptw-)?[0-9a-f-]{36}$/i.test(requestId)?requestId:'sha256:'+createHash('sha256').update(requestId).digest('hex')),endpoint:normalized,status:response?.status()??0,ms:timing.responseEnd<0?null:timing.responseEnd,bodyBytes:sizes.responseBodySize??null})
   }
   page.on('requestfinished',r=>void finish(r));page.on('requestfailed',r=>void finish(r,true))
   const useful=async title=>{
    await page.getByRole('heading',{name:title,exact:true}).waitFor()
    await page.locator('main').getByText('Carregando…',{exact:true}).first().waitFor({state:'hidden'})
    const deadline=Date.now()+60000
    while(pending.size){if(Date.now()>deadline)throw Error('critical-data-timeout');await page.waitForTimeout(50)}
   }
   const measure=async(name,fn)=>{
    scenario=name;const start=performance.now();let ok=false
    try{await fn();if(errors.some(e=>e.concurrency===concurrency&&e.worker===worker&&e.iteration===iteration&&e.scenario===name))throw Error('HTTP/JS error in measured scenario');ok=true}finally{results.push({concurrency,worker,iteration,scenario:name,ms:performance.now()-start,ok});persist()}
   }
   try{
    let warmup=true
    while(warmup||(iteration=next++)<samples){
     if(warmup)iteration=-1
     await page.goto(base.origin,{waitUntil:'domcontentloaded'});await page.getByLabel('Login',{exact:true}).waitFor()
     await page.getByLabel('Login',{exact:true}).fill(user.login);await page.getByLabel('Senha',{exact:true}).fill(user.password)
     await measure('login',async()=>{await page.getByRole('button',{name:'Entrar',exact:true}).click();await useful('Minha área')})
     await measure('reload',async()=>{await page.reload({waitUntil:'domcontentloaded'});await useful('Minha área')})
     for(const [route,title]of[['modelos','Modelos de PT'],['ativos','Ativos'],['quadro','Quadro de PTs']])await measure(route,async()=>{await page.evaluate(r=>location.hash=r,route);await useful(title)})
     scenario='logout';await page.getByRole('button',{name:/Pessoa atual:/}).click();await page.getByRole('button',{name:'Sair',exact:true}).click();await page.getByLabel('Login',{exact:true}).waitFor()
     console.log(`${environment}: ${concurrency} sessões, amostra ${iteration+1}/${samples} aprovada`)
     warmup=false
     if(pause)await page.waitForTimeout(pause)
    }
   }catch{errors.push({concurrency,worker,iteration,scenario,kind:'scenario-failed'});throw Error('Collection failed; consult sanitized evidence')}
   finally{await context.close()}
  }))
 }
}finally{await browser.close();persist()}
