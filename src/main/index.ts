import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, screen, net, powerMonitor } from 'electron'
import path from 'path'
import fs from 'fs'
import type { AppData, Schedule, Memo, Settings, AwayCheckSettings } from '../types'
import { DEFAULT_SETTINGS, DEFAULT_AWAY_CHECK } from '../types'

let dataPath: string

function readData(): AppData {
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    return {
      schedules: raw.schedules ?? [],
      memos: raw.memos ?? [],
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      awayCheck: { ...DEFAULT_AWAY_CHECK, ...raw.awayCheck }
    }
  } catch {
    return { schedules: [], memos: [], settings: { ...DEFAULT_SETTINGS }, awayCheck: { ...DEFAULT_AWAY_CHECK } }
  }
}

function writeData(data: AppData): void {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2))
}

let tray: Tray | null = null
let popupWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let alarmIntervalId: ReturnType<typeof setInterval> | null = null
let awayCheckIntervalId: ReturnType<typeof setInterval> | null = null
let awayAlertSent = false
let morningAlertSentDate = ''
let lastBlurTime = 0
let popupPinned = false

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
    height: 550,
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
    if (popupPinned) return
    if (popupWindow && popupWindow.isVisible()) {
      lastBlurTime = Date.now()
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

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  }

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset'
    windowOptions.trafficLightPosition = { x: 16, y: 16 }
  }

  mainWindow = new BrowserWindow(windowOptions)

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

  // blur로 방금 닫혔으면 다시 열지 않음 (트레이 클릭으로 닫기 위함)
  if (Date.now() - lastBlurTime < 300) {
    return
  }

  const trayBounds = tray!.getBounds()
  const windowBounds = popupWindow!.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  // macOS: 트레이가 위에 있으므로 아래로, Windows: 트레이가 아래에 있으므로 위로
  const y = process.platform === 'win32'
    ? trayBounds.y - windowBounds.height - 4
    : trayBounds.y + trayBounds.height + 4

  popupWindow!.setPosition(
    Math.max(display.workArea.x, Math.min(x, display.workArea.x + display.workArea.width - windowBounds.width)),
    Math.max(display.workArea.y, Math.min(y, display.workArea.y + display.workArea.height - windowBounds.height))
  )
  if (process.platform === 'darwin') {
    popupWindow!.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  popupWindow!.show()
  popupWindow!.focus()
}

function createTray(): void {
  const isWin = process.platform === 'win32'
  const iconFile = isWin ? 'icon.ico' : 'iconTemplate.png'
  const iconPath = path.join(__dirname, '../../resources', iconFile)
  const icon = nativeImage.createFromPath(iconPath)

  if (!isWin) {
    icon.setTemplateImage(true)
  }

  tray = new Tray(icon)
  tray.setToolTip('Todo Alarm')
  tray.on('click', () => togglePopup())
  tray.on('double-click', () => togglePopup())

  const contextMenu = Menu.buildFromTemplate([
    { label: '열기', click: () => createMainWindow() },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ])
  tray.on('right-click', () => tray!.popUpContextMenu(contextMenu))
}

function sendToAllWindows(channel: string, data: unknown): void {
  const windows = [popupWindow, mainWindow].filter(
    (w): w is BrowserWindow => w !== null && !w.isDestroyed()
  )
  windows.forEach((w) => w.webContents.send(channel, data))
}

async function sendSlackWebhook(webhookUrl: string, message: string): Promise<boolean> {
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

async function sendSlackBot(botToken: string, channelId: string, message: string): Promise<boolean> {
  try {
    const response = await net.fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${botToken}`
      },
      body: JSON.stringify({ channel: channelId, text: message })
    })
    const data = (await response.json()) as { ok: boolean }
    return data.ok
  } catch {
    return false
  }
}

function sendSlackNotification(settings: Settings, message: string): Promise<boolean> {
  if (settings.slackMethod === 'bot') {
    return sendSlackBot(settings.slackBotToken, settings.slackChannelId, message)
  }
  return sendSlackWebhook(settings.slackWebhookUrl, message)
}

function startAlarmChecker(): void {
  const data = readData()
  const interval = data.settings.checkInterval

  alarmIntervalId = setInterval(() => {
    const data = readData()
    const { settings } = data
    const now = new Date()
    let updated = false

    // 하루 시작 알림
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    if (settings.morningAlertEnabled && morningAlertSentDate !== todayStr) {
      const [mh, mm] = settings.morningAlertTime.split(':').map(Number)
      const morningTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), mh, mm)
      const morningDiff = now.getTime() - morningTime.getTime()
      if (morningDiff >= 0 && morningDiff < 120000) {
        const todaySchedules = data.schedules.filter((s) => s.date === todayStr)
        if (todaySchedules.length > 0) {
          const body = todaySchedules.map((s) => `${s.time} ${s.content}`).join('\n')
          if (settings.macNotification) {
            new Notification({
              title: `📋 오늘 일정 (${todaySchedules.length}건)`,
              body,
              sound: 'default'
            }).show()
          }
          if (settings.slackEnabled) {
            sendSlackNotification(settings, `📋 *오늘 일정 (${todaySchedules.length}건)*\n${body}`)
          }
        }
        morningAlertSentDate = todayStr
      }
    }

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

        if (settings.slackEnabled) {
          sendSlackNotification(
            settings,
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

function startAwayChecker(): void {
  stopAwayChecker()
  const data = readData()
  if (!data.awayCheck.enabled) return

  awayCheckIntervalId = setInterval(() => {
    const current = readData()
    if (!current.awayCheck.enabled) return

    const idleSeconds = powerMonitor.getSystemIdleTime()

    // UI에 현재 상태 전송
    sendToAllWindows('idle-status', { idleSeconds, limitSeconds: current.awayCheck.limitMinutes * 60 })

    // 제외 시간대 체크
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const { excludeLunch, lunchStart, lunchEnd, excludeAfterWork, afterWorkTime } = current.awayCheck

    if (excludeLunch) {
      const [lsh, lsm] = lunchStart.split(':').map(Number)
      const [leh, lem] = lunchEnd.split(':').map(Number)
      if (currentMinutes >= lsh * 60 + lsm && currentMinutes < leh * 60 + lem) {
        awayAlertSent = false
        return
      }
    }
    if (excludeAfterWork) {
      const [awh, awm] = afterWorkTime.split(':').map(Number)
      if (currentMinutes >= awh * 60 + awm) {
        awayAlertSent = false
        return
      }
    }

    if (idleSeconds >= current.awayCheck.limitMinutes * 60) {
      if (!awayAlertSent) {
        awayAlertSent = true

        if (current.settings.macNotification) {
          new Notification({
            title: '⚠️ 이석 경고!',
            body: `${current.awayCheck.limitMinutes}분 이상 자리를 비웠습니다!`,
            sound: 'default'
          }).show()
        }

        if (current.settings.slackEnabled) {
          sendSlackNotification(
            current.settings,
            `⚠️ *이석 경고!* ${current.awayCheck.limitMinutes}분 이상 자리를 비웠습니다!`
          )
        }
      }
    } else {
      awayAlertSent = false
    }
  }, 5000) // 5초마다 체크
}

function stopAwayChecker(): void {
  if (awayCheckIntervalId) {
    clearInterval(awayCheckIntervalId)
    awayCheckIntervalId = null
  }
  awayAlertSent = false
}

if (process.platform === 'darwin') {
  app.dock?.hide()
}

app.whenReady().then(() => {
  dataPath = path.join(app.getPath('userData'), 'data.json')
  createTray()
  createPopupWindow()
  startAlarmChecker()
  startAwayChecker()
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

ipcMain.handle('get-away-check', () => readData().awayCheck)
ipcMain.handle('save-away-check', (_, awayCheck: AwayCheckSettings) => {
  const data = readData()
  data.awayCheck = awayCheck
  writeData(data)
  sendToAllWindows('away-check-updated', awayCheck)
  startAwayChecker()
  return true
})

ipcMain.handle('set-pinned', (_, pinned: boolean) => {
  popupPinned = pinned
  return true
})

ipcMain.handle('open-main-window', () => {
  createMainWindow()
  if (popupWindow && popupWindow.isVisible()) {
    popupWindow.hide()
  }
  return true
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

ipcMain.handle('test-slack', async (_, config: { method: string; webhookUrl: string; botToken: string; channelId: string }) => {
  try {
    const message = '🔔 *Todo Alarm 테스트*\nSlack 알림이 정상적으로 연결되었습니다!'
    const success = config.method === 'bot'
      ? await sendSlackBot(config.botToken, config.channelId, message)
      : await sendSlackWebhook(config.webhookUrl, message)
    return { success }
  } catch {
    return { success: false, error: '전송 실패' }
  }
})
