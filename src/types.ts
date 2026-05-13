export interface Schedule {
  id: number
  date: string
  time: string
  content: string
  datetime: string
  notified: boolean
}

export interface Memo {
  id: number
  content: string
  createdAt: string
}

export type SlackMethod = 'webhook' | 'bot'

export interface Settings {
  checkInterval: number // ms (1800000 ~ 86400000)
  macNotification: boolean
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
  macNotification: true,
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
  slackMethod: SlackMethod
  slackWebhookUrl: string
  slackBotToken: string
  slackChannelId: string
  peopleFilePath: string
  assignmentsFilePath: string
}

export const DEFAULT_DUTY: DutySettings = {
  enabled: false,
  alertTime: '09:00',
  people: [],
  assignments: [],
  slackMethod: 'webhook',
  slackWebhookUrl: '',
  slackBotToken: '',
  slackChannelId: '',
  peopleFilePath: '',
  assignmentsFilePath: '',
}

export interface AppData {
  schedules: Schedule[]
  memos: Memo[]
  settings: Settings
  awayCheck: AwayCheckSettings
  morningAlertSentDate?: string
  trash: TrashItem[]
  duty: DutySettings
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
  pickFile: (kind: 'people' | 'assignments') => Promise<{ canceled: boolean; path?: string }>
  applyDutyFiles: (paths: { peopleFilePath: string; assignmentsFilePath: string }) => Promise<{ success: boolean; error?: string; peopleCount?: number; assignmentsCount?: number }>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
