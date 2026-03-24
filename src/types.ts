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

export interface Settings {
  checkInterval: number // ms (30000, 60000, 300000)
  macNotification: boolean
  slackEnabled: boolean
  slackWebhookUrl: string
  alertTiming: number // 분 단위 (0 = 정시, 5, 10, 30)
}

export const DEFAULT_SETTINGS: Settings = {
  checkInterval: 30000,
  macNotification: true,
  slackEnabled: false,
  slackWebhookUrl: '',
  alertTiming: 0
}

export interface AppData {
  schedules: Schedule[]
  memos: Memo[]
  settings: Settings
}

export interface ElectronAPI {
  getSchedules: () => Promise<Schedule[]>
  saveSchedules: (schedules: Schedule[]) => Promise<boolean>
  getMemos: () => Promise<Memo[]>
  saveMemos: (memos: Memo[]) => Promise<boolean>
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<boolean>
  openMainWindow: () => Promise<boolean>
  testNotification: () => Promise<boolean>
  testSlack: (webhookUrl: string) => Promise<{ success: boolean; error?: string }>
  onSchedulesUpdated: (callback: (schedules: Schedule[]) => void) => void
  onMemosUpdated: (callback: (memos: Memo[]) => void) => void
  checkNotificationPermission: () => Promise<boolean>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
