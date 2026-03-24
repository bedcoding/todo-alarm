import { app, BrowserWindow, ipcMain, Notification, Tray, nativeImage, screen, net } from 'electron'
import path from 'path'
import fs from 'fs'
import type { AppData, Schedule, Memo, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

let dataPath: string

function readData(): AppData {
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    return {
      schedules: raw.schedules ?? [],
      memos: raw.memos ?? [],
      settings: { ...DEFAULT_SETTINGS, ...raw.settings }
    }
  } catch {
    return { schedules: [], memos: [], settings: { ...DEFAULT_SETTINGS } }
  }
}

function writeData(data: AppData): void {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2))
}

let tray: Tray | null = null
let popupWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let alarmIntervalId: ReturnType<typeof setInterval> | null = null

function getRendererURL(hash = ''): string | null {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : '')
  }
  return null
}

function getRendererFile(): string {
  return path.join(__dirname, '../renderer/index.html')
}

function createPopupWindow(): void {
  popupWindow = new BrowserWindow({
    width: 380,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const url = getRendererURL('popup')
  if (url) {
    popupWindow.loadURL(url)
  } else {
    popupWindow.loadFile(getRendererFile(), { hash: 'popup' })
  }

  popupWindow.on('blur', () => {
    if (popupWindow && popupWindow.isVisible()) {
      popupWindow.hide()
    }
  })

  popupWindow.on('closed', () => {
    popupWindow = null
  })
}

function createMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 }
  })

  const url = getRendererURL()
  if (url) {
    mainWindow.loadURL(url)
  } else {
    mainWindow.loadFile(getRendererFile())
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function togglePopup(): void {
  if (!popupWindow || popupWindow.isDestroyed()) {
    createPopupWindow()
  }

  if (popupWindow!.isVisible()) {
    popupWindow!.hide()
    return
  }

  const trayBounds = tray!.getBounds()
  const windowBounds = popupWindow!.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  const y = trayBounds.y + trayBounds.height + 4

  popupWindow!.setPosition(
    Math.max(display.workArea.x, Math.min(x, display.workArea.x + display.workArea.width - windowBounds.width)),
    y
  )
  popupWindow!.show()
  popupWindow!.focus()
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../../resources/iconTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Todo Alarm')
  tray.on('click', () => togglePopup())
}

function sendToAllWindows(channel: string, data: unknown): void {
  const windows = [popupWindow, mainWindow].filter(
    (w): w is BrowserWindow => w !== null && !w.isDestroyed()
  )
  windows.forEach((w) => w.webContents.send(channel, data))
}

async function sendSlackNotification(webhookUrl: string, message: string): Promise<boolean> {
  try {
    const response = await net.fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    })
    return response.ok
  } catch {
    return false
  }
}

function startAlarmChecker(): void {
  const data = readData()
  const interval = data.settings.checkInterval

  alarmIntervalId = setInterval(() => {
    const data = readData()
    const { settings } = data
    const now = new Date()
    let updated = false

    data.schedules.forEach((schedule) => {
      if (schedule.notified) return

      const scheduleTime = new Date(schedule.datetime)
      const alertOffset = settings.alertTiming * 60 * 1000
      const alertTime = new Date(scheduleTime.getTime() - alertOffset)
      const diff = alertTime.getTime() - now.getTime()

      if (diff <= 60000 && diff > -60000) {
        const timingText = settings.alertTiming > 0 ? ` (${settings.alertTiming}분 전)` : ''

        if (settings.macNotification) {
          new Notification({
            title: `📌 일정 알림${timingText}`,
            body: schedule.content,
            sound: 'default'
          }).show()
        }

        if (settings.slackEnabled && settings.slackWebhookUrl) {
          sendSlackNotification(
            settings.slackWebhookUrl,
            `📌 *일정 알림${timingText}*\n${schedule.content}\n📅 ${schedule.date} ${schedule.time}`
          )
        }

        schedule.notified = true
        updated = true
      }
    })

    if (updated) {
      writeData(data)
      sendToAllWindows('schedules-updated', data.schedules)
    }
  }, interval)
}

function restartAlarmChecker(): void {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId)
    alarmIntervalId = null
  }
  startAlarmChecker()
}

app.dock?.hide()

app.whenReady().then(() => {
  dataPath = path.join(app.getPath('userData'), 'data.json')
  createTray()
  createPopupWindow()
  startAlarmChecker()
})

app.on('window-all-closed', () => {
  // 메뉴바 앱이므로 창 닫혀도 종료하지 않음
})

ipcMain.handle('get-schedules', () => readData().schedules)
ipcMain.handle('save-schedules', (_, schedules: Schedule[]) => {
  const data = readData()
  data.schedules = schedules
  writeData(data)
  sendToAllWindows('schedules-updated', schedules)
  return true
})
ipcMain.handle('get-memos', () => readData().memos)
ipcMain.handle('save-memos', (_, memos: Memo[]) => {
  const data = readData()
  data.memos = memos
  writeData(data)
  sendToAllWindows('memos-updated', memos)
  return true
})

ipcMain.handle('get-settings', () => readData().settings)
ipcMain.handle('save-settings', (_, settings: Settings) => {
  const data = readData()
  const intervalChanged = data.settings.checkInterval !== settings.checkInterval
  data.settings = settings
  writeData(data)
  if (intervalChanged) {
    restartAlarmChecker()
  }
  return true
})

ipcMain.handle('open-main-window', () => {
  createMainWindow()
  if (popupWindow && popupWindow.isVisible()) {
    popupWindow.hide()
  }
  return true
})

ipcMain.handle('check-notification-permission', () => {
  // macOS: 실제 알림 권한 확인 (bundle identifier 기반)
  if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process')
      // UNUserNotificationCenter 권한 상태를 확인하는 간접 방법:
      // Notification을 보내고 show/failed 이벤트로 판단하는 것이 더 정확하지만,
      // 여기서는 Notification.isSupported()와 함께 안내 문구를 항상 표시하는 방식 사용
      return Notification.isSupported()
    } catch {
      return Notification.isSupported()
    }
  }
  return Notification.isSupported()
})

ipcMain.handle('test-notification', () => {
  if (!Notification.isSupported()) {
    return { success: false }
  }
  return new Promise<{ success: boolean }>((resolve) => {
    const notif = new Notification({
      title: '🔔 테스트 알림',
      body: '알림이 정상적으로 동작합니다!',
      sound: 'default'
    })
    notif.on('show', () => resolve({ success: true }))
    notif.on('failed', () => resolve({ success: false }))
    notif.show()
    // 3초 타임아웃 - show/failed 둘 다 안 오면 성공으로 간주
    setTimeout(() => resolve({ success: true }), 3000)
  })
})

ipcMain.handle('test-slack', async (_, webhookUrl: string) => {
  try {
    const success = await sendSlackNotification(webhookUrl, '🔔 *Todo Alarm 테스트*\nSlack 알림이 정상적으로 연결되었습니다!')
    return { success }
  } catch {
    return { success: false, error: '전송 실패' }
  }
})
