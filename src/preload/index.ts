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
  testAwayNotification: () => ipcRenderer.invoke('test-away-notification'),
  testSlack: (config: unknown) => ipcRenderer.invoke('test-slack', config),
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
  setPinned: (pinned: boolean) => ipcRenderer.invoke('set-pinned', pinned),
  getTrash: () => ipcRenderer.invoke('get-trash'),
  saveTrash: (trash: unknown[]) => ipcRenderer.invoke('save-trash', trash),
  onTrashUpdated: (callback: (trash: unknown[]) => void) => {
    ipcRenderer.on('trash-updated', (_, trash) => callback(trash))
  },
  getDuty: () => ipcRenderer.invoke('get-duty'),
  saveDuty: (duty: unknown) => ipcRenderer.invoke('save-duty', duty),
  onDutyUpdated: (callback: (duty: unknown) => void) => {
    ipcRenderer.on('duty-updated', (_, duty) => callback(duty))
  },
  testDutySlack: (config: unknown) => ipcRenderer.invoke('test-duty-slack', config),
  pickFile: (kind: 'people' | 'assignments') => ipcRenderer.invoke('pick-duty-file', kind),
  applyDutyFiles: (paths: { peopleFilePath: string; assignmentsFilePath: string }) =>
    ipcRenderer.invoke('apply-duty-files', paths),
  resetDutyLastSent: () => ipcRenderer.invoke('reset-duty-last-sent')
})
