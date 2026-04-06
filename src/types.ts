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
  checkInterval: number // ms (30000, 60000, 300000)
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
  checkInterval: 30000,
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

export interface AppData {
  schedules: Schedule[]
  memos: Memo[]
  settings: Settings
  awayCheck: AwayCheckSettings
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
  testSlack: (config: { method: SlackMethod; webhookUrl: string; botToken: string; channelId: string }) => Promise<{ success: boolean; error?: string }>
  onSchedulesUpdated: (callback: (schedules: Schedule[]) => void) => void
  onMemosUpdated: (callback: (memos: Memo[]) => void) => void
  onAwayCheckUpdated: (callback: (awayCheck: AwayCheckSettings) => void) => void
  onIdleStatus: (callback: (data: { idleSeconds: number; limitSeconds: number; excluded?: boolean }) => void) => void
  setPinned: (pinned: boolean) => Promise<boolean>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
