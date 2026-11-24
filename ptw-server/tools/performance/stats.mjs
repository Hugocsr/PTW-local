export function distribution(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a,b)=>a-b)
  if (!sorted.length) return { n:0, medianMs:null, p95Ms:null, maxMs:null }
  const middle=sorted.length/2
  return { n:sorted.length, medianMs:sorted.length%2?sorted[Math.floor(middle)]:(sorted[middle-1]+sorted[middle])/2,
    p95Ms:sorted[Math.ceil(sorted.length*.95)-1], maxMs:sorted.at(-1) }
}

export function grouped(samples) {
  return Object.fromEntries([...new Set(samples.map(s=>`${s.concurrency}:${s.scenario}`))].map(key=>{
    const group=samples.filter(s=>`${s.concurrency}:${s.scenario}`===key)
    return [key,{ ...distribution(group.filter(s=>s.ok).map(s=>s.ms)), failures:group.filter(s=>!s.ok).length }]
  }))
}
