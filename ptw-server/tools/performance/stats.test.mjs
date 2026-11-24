import{test}from'node:test'
import assert from'node:assert/strict'
import{distribution,grouped}from'./stats.mjs'
import{performanceRecords}from'./collect-logs.mjs'
test('nearest-rank percentiles do not hide failures or mix concurrency',()=>{
 assert.deepEqual(distribution(Array.from({length:20},(_,i)=>i+1)),{n:20,medianMs:10.5,p95Ms:19,maxMs:20})
 assert.equal(distribution([]).p95Ms,null)
 const out=grouped([{concurrency:1,scenario:'login',ok:true,ms:1},{concurrency:1,scenario:'login',ok:false,ms:0},{concurrency:4,scenario:'login',ok:true,ms:4}])
 assert.equal(out['1:login'].failures,1);assert.equal(out['4:login'].medianMs,4)
})
test('log collector projects safe fields and omits arbitrary private data',()=>{
 const records=performanceRecords(JSON.stringify({event:'ptw.performance.request',requestId:'ptw-123',operation:'getUnit',totalMs:12,cookie:'SECRET',params:['SECRET'],body:{password:'SECRET'}})+'\n'+JSON.stringify({msg:'private SECRET'}))
 assert.equal(records.length,1);assert.equal(records[0].totalMs,12)
 assert.ok(!JSON.stringify(records).includes('SECRET'))
})
