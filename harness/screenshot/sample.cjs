// 캡처에 쓸 예시 데이터. 날짜는 실행한 날을 기준으로 잡는다.
const pad = (n) => String(n).padStart(2, '0')
const day = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

module.exports = () => {
  let id = 1
  const schedule = (offset, time, content, extra = {}) => {
    const date = day(offset)
    return { id: id++, date, time, content, datetime: new Date(`${date}T${time}`).toISOString(), notified: offset < 0, ...extra }
  }
  const memo = (content, minutesAgo) => ({ id: id++, content, createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString() })

  const people = [
    { id: 'p1', name: '다리오', slackUserId: 'U0000001', color: 'hsl(14, 75%, 62%)' },
    { id: 'p2', name: '클로드', slackUserId: 'U0000002', color: 'hsl(250, 60%, 70%)' },
    { id: 'p3', name: '나', slackUserId: 'U0000003', color: 'hsl(150, 50%, 58%)' }
  ]
  const assignments = []
  for (let i = -10; i <= 20; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    assignments.push({ id: `a${i}`, date: day(i), personIds: [people[(i + 30) % 3].id] })
  }

  return {
    // 지난 시각은 흐리게 보이므로 전부 내일로 잡는다.
    // 팝업에 4건 정도만 보여서 이야기의 핵심을 앞쪽에 둔다.
    schedules: [
      schedule(1, '10:00', '다리오 때려서 클로드 요금 50% 할인받기'),
      schedule(1, '14:00', '할인된 클로드 청구서 확인'),
      schedule(1, '18:00', '파스 붙이기'),
      schedule(3, '15:00', '다리오한테 사과 선물 보내기')
    ],
    memos: [
      memo('다리오 출근 시간 9:58 전후. 엘리베이터보다 계단 쪽이 확률 높음', 5),
      memo('협상 멘트\n"이번 달 사용량 보셨어요?"\n"저도 이러고 싶지 않았습니다"', 40),
      memo('복싱 장갑은 빨간색 말고 파란색. 빨간색은 너무 공격적으로 보임', 180),
      memo('플랜B: 말로 해결되면 장갑 반품하기', 600)
    ],
    routines: [
      { id: 900, content: 'Claude 사용료 확인', time: '10:00', enabled: true, freq: 'monthly', monthDay: 1, weekdays: [1], holidayShift: 'next', holidayBasis: 'publicHoliday', skippedKeys: [], createdAt: new Date().toISOString() }
    ],
    settings: { checkInterval: 43200000, scheduleEnabled: true, alertTiming: 5, morningAlertEnabled: true, morningAlertTime: '09:00', slackEnabled: true, slackMethod: 'webhook', slackWebhookUrl: '', slackBotToken: '', slackChannelId: '' },
    awayCheck: { enabled: true, limitMinutes: 20, excludeBeforeWork: true, beforeWorkTime: '09:00', excludeLunch: true, lunchStart: '12:00', lunchEnd: '13:00', excludeAfterWork: true, afterWorkTime: '18:00', excludeDays: [0, 6] },
    duty: { enabled: true, alertTime: '09:00', people, assignments, slackEnabled: true, slackMethod: 'webhook', slackWebhookUrl: '', slackBotToken: '', slackChannelId: '', apiUrl: '', peoplePoolCollapsed: false }
  }
}
