import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getSchedules: () => ipcRenderer.invoke('get-schedules'),
  saveSchedules: (schedules: unknown[]) => ipcRenderer.invoke('save-schedules', schedules),
  getMemos: () => ipcRenderer.invoke('get-memos'),
  saveMemos: (memos: unknown[]) => ipcRenderer.invoke('save-memos', memos),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('save-settings', settings),
  getAwayCheck: () => ipcRenderer.invoke('get-away-check'),
  saveAwayCheck: (awayCheck: unknown) => ipcRenderer.invoke('save-away-check', awayCheck),
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  testNotification: () => ipcRenderer.invoke('test-notification'),
  testSlack: (webhookUrl: string) => ipcRenderer.invoke('test-slack', webhookUrl),
  onSchedulesUpdated: (callback: (schedules: unknown[]) => void) => {
    ipcRenderer.on('schedules-updated', (_, schedules) => callback(schedules))
  },
  onMemosUpdated: (callback: (memos: unknown[]) => void) => {
    ipcRenderer.on('memos-updated', (_, memos) => callback(memos))
  },
  onAwayCheckUpdated: (callback: (awayCheck: unknown) => void) => {
    ipcRenderer.on('away-check-updated', (_, awayCheck) => callback(awayCheck))
  },
  onIdleStatus: (callback: (data: unknown) => void) => {
    ipcRenderer.on('idle-status', (_, data) => callback(data))
  },
  setPinned: (pinned: boolean) => ipcRenderer.invoke('set-pinned', pinned)
})
