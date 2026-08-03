const { boot, read } = require('./base.cjs')
const wait = (ms) => new Promise((r)=>setTimeout(r,ms))
let pass=0, fail=0
const ok=(l,c,d='')=>{ if(c){pass++;console.log(`  ok   ${l}`)}else{fail++;console.log(`  FAIL ${l} ${d}`)} }
;(async () => {
  console.log('[1] 첫 실행 — 기록이 없으면 확인한다 (30초 대기)')
  const s = boot({}, { version: '1.0.0' })
  await s.readyResolve()
  await wait(33000)
  ok('API 호출됨', s.apiCalls === 1, `${s.apiCalls}회`)
  ok('새 버전 팝업', s.dialogs.length === 1 && s.dialogs[0].message.includes('새 버전'))
  const stamp = read().lastUpdateCheckAt
  ok('확인 시각 기록됨', !!stamp, JSON.stringify(stamp))

  console.log('\n[2] 재시작 반복 — 주기 전에는 확인하지 않는다')
  // 방금 확인한 상태를 그대로 둔 채 여러 번 재기동
  let calls = 0, dlgs = 0
  for (let i = 1; i <= 3; i++) {
    const r = boot({ lastUpdateCheckAt: stamp }, { version: '1.0.0' })
    await r.readyResolve(); await wait(32000)
    calls += r.apiCalls; dlgs += r.dialogs.length
    console.log(`    재기동 ${i}회차 → API ${r.apiCalls}회, 팝업 ${r.dialogs.length}건`)
  }
  ok('3번 재시작해도 API 0회', calls === 0, `${calls}회`)
  ok('팝업도 0건', dlgs === 0, `${dlgs}건`)

  console.log('\n[3] 6일 경과 — 아직 주기 전')
  const d6 = new Date(Date.now() - 6*24*3600*1000).toISOString()
  const s6 = boot({ lastUpdateCheckAt: d6 }, { version: '1.0.0' })
  await s6.readyResolve(); await wait(32000)
  ok('확인하지 않음', s6.apiCalls === 0, `${s6.apiCalls}회`)

  console.log('\n[4] 8일 경과 — 주기 도래')
  const d8 = new Date(Date.now() - 8*24*3600*1000).toISOString()
  const s8 = boot({ lastUpdateCheckAt: d8 }, { version: '1.0.0' })
  await s8.readyResolve(); await wait(33000)
  ok('확인함', s8.apiCalls === 1, `${s8.apiCalls}회`)
  ok('팝업 표시', s8.dialogs.length === 1)
  ok('시각 갱신됨', new Date(read().lastUpdateCheckAt).getTime() > new Date(d8).getTime())

  console.log('\n[5] 수동 확인은 주기와 무관하게 항상 동작')
  const sm = boot({ lastUpdateCheckAt: new Date().toISOString() }, { version: '1.0.0' })
  await sm.readyResolve()
  sm.menu.find((i)=>i.label==='업데이트 확인').click()
  await wait(2500)
  ok('방금 확인했어도 수동은 실행', sm.apiCalls === 1, `${sm.apiCalls}회`)
  ok('팝업 표시', sm.dialogs.length === 1 && sm.dialogs[0].message.includes('새 버전'))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail?1:0)
})().catch((e)=>{console.error('ERR',e);process.exit(1)})
