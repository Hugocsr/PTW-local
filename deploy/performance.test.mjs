import{test}from'node:test'
import assert from'node:assert/strict'
import{startupTimings}from'./performance.mjs'

test('disabled startup metrics do not emit or alter environment',()=>{
 const env={};const records=[];startupTimings(env,r=>records.push(r))('initializing')
 assert.deepEqual(records,[]);assert.deepEqual(env,{})
})
test('startup metrics share an ephemeral identity and omit secrets',()=>{
 const env={PTW_PERF:'1',PTW_DB_PASSWORD:'SECRET'};const records=[];let now=0
 const stage=startupTimings(env,r=>records.push(r),()=>now)
 now=12;stage('directory_prepared');now=20;stage('api_healthy')
 assert.equal(records[0].elapsedMs,12);assert.equal(records[1].elapsedMs,20)
 assert.equal(records[0].instance,env.PTW_PERF_INSTANCE)
 assert.equal(records[1].instance,records[0].instance)
 assert.ok(!JSON.stringify(records).includes('SECRET'))
})
