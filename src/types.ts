// 같은 ms에 ID를 두 번 만들어도 충돌 안 나도록 하위 1000자리에 난수 섞음
export function makeId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000)
}

export interface Schedule {
  id: number
  date: string
  time: string
  content: string
  datetime: string
  notified: boolean
  // 반복 규칙에서 자동 생성된 일정일 때만 존재
  routineId?: number
  occurrenceKey?: string // `${routineId}:${시프트 전 기준일}` — 재전개 멱등키
  detached?: boolean // 사용자가 개별 수정함 → 재전개 시 보존
}

export interface Memo {
  id: number
  content: string
  createdAt: string
}

/** 날짜 고정(매월 N일 / 말일) 또는 요일 고정(매주 O요일) */
export type RoutineFreq = 'monthly' | 'weekly'

/**
 * 휴일(토·일 + 한국 공휴일)에 걸렸을 때의 처리.
 * 'none' = 그날 그대로 발송 (월세처럼 날짜가 절대적인 것)
 * 'next' = 다음 영업일로 밀기 (법인카드 정산처럼 업무일 기준인 것)
 * 'prev' = 이전 영업일로 당기기 (마감이 그 날짜인 것)
 */
export type HolidayShift = 'none' | 'next' | 'prev'

/**
 * 무엇을 "휴일"로 볼지. 업종에 따라 평일 공휴일에도 출근하는 경우가 있어 규칙별로 고른다.
 * 'weekend' = 토·일만
 * 'publicHoliday' = 토·일 + 한국 법정공휴일
 */
export type HolidayBasis = 'weekend' | 'publicHoliday'

export interface RoutineRule {
  id: number
  content: string
  time: string // "10:00"
  enabled: boolean
  freq: RoutineFreq
  monthDay: number | 'last' // freq='monthly'일 때 사용. 1~31 또는 말일
  weekdays: number[] // freq='weekly'일 때 사용. 0=일 ~ 6=토
  holidayShift: HolidayShift // freq='monthly'일 때만 유효
  holidayBasis: HolidayBasis // holidayShift가 'none'이 아닐 때만 의미 있음
  skippedKeys: string[] // 사용자가 개별 삭제한 발생분 (재전개 시 되살아나지 않도록)
  createdAt: string
}

export function makeRoutine(): RoutineRule {
  return {
    id: makeId(),
    content: '',
    time: '10:00',
    enabled: true,
    freq: 'monthly',
    monthDay: 1,
    weekdays: [1],
    holidayShift: 'none',
    holidayBasis: 'publicHoliday',
    skippedKeys: [],
    createdAt: new Date().toISOString(),
  }
}

export interface HolidayEntry {
  date: string // "2026-08-17"
  name: string // "광복절"
}

/** Nager.Date에서 받아온 연도별 한국 공휴일. 오프라인 대비 디스크 캐시 */
export interface HolidayCache {
  years: Record<string, HolidayEntry[]>
  fetchedAt: string
}

export type SlackMethod = 'webhook' | 'bot'

export interface Settings {
  checkInterval: number // ms (1800000 ~ 86400000)
  scheduleEnabled: boolean
  alertTiming: number // 분 단위 (0 = 정시, 5, 10, 30)
  morningAlertEnabled: boolean
  morningAlertTime: string // "09:00" 형식
  slackEnabled: boolean
  slackMethod: SlackMethod
  slackWebhookUrl: string
  slackBotToken: string
  slackChannelId: string
}

export const DEFAULT_SETTINGS: Settings = {
  checkInterval: 43200000,
  scheduleEnabled: true,
  alertTiming: 0,
  morningAlertEnabled: false,
  morningAlertTime: '09:00',
  slackEnabled: false,
  slackMethod: 'webhook',
  slackWebhookUrl: '',
  slackBotToken: '',
  slackChannelId: '',
}

export interface AwayCheckSettings {
  enabled: boolean
  limitMinutes: number
  excludeBeforeWork: boolean
  beforeWorkTime: string // "09:00"
  excludeLunch: boolean
  lunchStart: string // "12:00"
  lunchEnd: string   // "13:00"
  excludeAfterWork: boolean
  afterWorkTime: string // "18:00"
  excludeDays: number[] // 0=일, 1=월, ..., 6=토
}

export const DEFAULT_AWAY_CHECK: AwayCheckSettings = {
  enabled: false,
  limitMinutes: 20,
  excludeBeforeWork: true,
  beforeWorkTime: '09:00',
  excludeLunch: false,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  excludeAfterWork: false,
  afterWorkTime: '18:00',
  excludeDays: [0, 6],
}

export interface TrashItem {
  id: number
  type: 'schedule' | 'memo'
  data: Schedule | Memo
  deletedAt: string
}

export interface DutyPerson {
  id: string
  name: string
  slackUserId: string
  color: string
}

export interface DutyAssignment {
  id: string
  date: string
  personIds: string[]
}

export interface DutySettings {
  enabled: boolean
  alertTime: string
  people: DutyPerson[]
  assignments: DutyAssignment[]
  lastSentDate?: string
  slackEnabled: boolean
  slackMethod: SlackMethod
  slackWebhookUrl: string
  slackBotToken: string
  slackChannelId: string
  apiUrl: string
  lastApiSyncAt?: string
  peoplePoolCollapsed: boolean
}

export const DEFAULT_DUTY: DutySettings = {
  enabled: false,
  alertTime: '09:00',
  people: [],
  assignments: [],
  slackEnabled: true,
  slackMethod: 'webhook',
  slackWebhookUrl: '',
  slackBotToken: '',
  slackChannelId: '',
  apiUrl: '',
  peoplePoolCollapsed: false,
}

export interface AppData {
  schedules: Schedule[]
  memos: Memo[]
  settings: Settings
  awayCheck: AwayCheckSettings
  morningAlertSentDate?: string
  trash: TrashItem[]
  duty: DutySettings
  routines: RoutineRule[]
  holidays?: HolidayCache
}

export interface ElectronAPI {
  getSchedules: () => Promise<Schedule[]>
  saveSchedules: (schedules: Schedule[]) => Promise<boolean>
  getMemos: () => Promise<Memo[]>
  saveMemos: (memos: Memo[]) => Promise<boolean>
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<boolean>
  getAwayCheck: () => Promise<AwayCheckSettings>
  saveAwayCheck: (awayCheck: AwayCheckSettings) => Promise<boolean>
  openMainWindow: () => Promise<boolean>
  testNotification: () => Promise<{ success: boolean }>
  testAwayNotification: () => Promise<{ success: boolean }>
  testSlack: (config: { method: SlackMethod; webhookUrl: string; botToken: string; channelId: string }) => Promise<{ success: boolean; error?: string }>
  onSchedulesUpdated: (callback: (schedules: Schedule[]) => void) => void
  onMemosUpdated: (callback: (memos: Memo[]) => void) => void
  onAwayCheckUpdated: (callback: (awayCheck: AwayCheckSettings) => void) => void
  onIdleStatus: (callback: (data: { idleSeconds: number; limitSeconds: number; excluded?: boolean }) => void) => void
  setPinned: (pinned: boolean) => Promise<boolean>
  getTrash: () => Promise<TrashItem[]>
  saveTrash: (trash: TrashItem[]) => Promise<boolean>
  onTrashUpdated: (callback: (trash: TrashItem[]) => void) => void
  getDuty: () => Promise<DutySettings>
  saveDuty: (duty: DutySettings) => Promise<boolean>
  onDutyUpdated: (callback: (duty: DutySettings) => void) => void
  testDutySlack: (config: { method: SlackMethod; webhookUrl: string; botToken: string; channelId: string }) => Promise<{ success: boolean; error?: string }>
  testDutyDispatch: () => Promise<{ success: boolean; slackAttempted?: boolean; error?: string }>
  applyDutyApi: (
    input: { mode: 'url'; url: string } | { mode: 'paste'; payload: string }
  ) => Promise<{ success: boolean; error?: string; peopleCount?: number; assignmentsCount?: number; month?: string; syncedAt?: string }>
  resetDutyLastSent: () => Promise<boolean>
  getRoutines: () => Promise<RoutineRule[]>
  saveRoutines: (routines: RoutineRule[]) => Promise<boolean>
  onRoutinesUpdated: (callback: (routines: RoutineRule[]) => void) => void
  skipOccurrence: (routineId: number, occurrenceKey: string) => Promise<boolean>
  unskipOccurrence: (routineId: number, occurrenceKey: string) => Promise<boolean>
  getHolidays: () => Promise<{ entries: HolidayEntry[]; fetchedAt?: string; offline: boolean }>
  refreshHolidays: () => Promise<{ success: boolean; count?: number; error?: string }>
  previewRoutine: (rule: RoutineRule) => Promise<{ date: string; shifted: boolean; reason?: string }[]>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
