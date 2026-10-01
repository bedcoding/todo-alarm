// README 캡처용 가짜 API.
// 실제 data.json 대신 sample.cjs의 예시 데이터를 돌려준다.
const { contextBridge } = require('electron')
const data = require('./sample.cjs')()
const ok = async () => true
const noop = () => {}
contextBridge.exposeInMainWorld('api', {
  getSchedules: async () => data.schedules,
  saveSchedules: ok,
  getMemos: async () => data.memos,
  saveMemos: ok,
  getSettings: async () => data.settings,
  saveSettings: ok,
  getAwayCheck: async () => data.awayCheck,
  saveAwayCheck: ok,
  openMainWindow: ok,
  testNotification: async () => ({ success: true }),
  testAwayNotification: async () => ({ success: true }),
  testSlack: async () => ({ success: true }),
  onSchedulesUpdated: noop,
  onMemosUpdated: noop,
  onAwayCheckUpdated: noop,
  // 이석 타이머가 돌고 있는 모습을 보여주려고 7분 째 자리를 비운 상태로 고정
  onIdleStatus: (cb) => setTimeout(() => cb({ idleSeconds: 7 * 60 + 25, limitSeconds: 20 * 60 }), 50),
  setPinned: ok,
  getTrash: async () => [],
  saveTrash: ok,
  onTrashUpdated: noop,
  getDuty: async () => data.duty,
  saveDuty: ok,
  onDutyUpdated: noop,
  testDutySlack: async () => ({ success: true }),
  testDutyDispatch: async () => ({ success: true }),
  applyDutyApi: async () => ({ success: true }),
  resetDutyLastSent: ok,
  getRoutines: async () => data.routines,
  saveRoutines: ok,
  onRoutinesUpdated: noop,
  skipOccurrence: ok,
  unskipOccurrence: ok,
  getHolidays: async () => ({ entries: [], offline: false }),
  refreshHolidays: async () => ({ success: true }),
  previewRoutine: async () => []
})
