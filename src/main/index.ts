import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, screen, net, powerMonitor } from 'electron'
import path from 'path'
import fs from 'fs'
import type { AppData, Schedule, Memo, Settings, AwayCheckSettings, TrashItem } from '../types'
import { DEFAULT_SETTINGS, DEFAULT_AWAY_CHECK } from '../types'

let dataPath: string

function readData(): AppData {
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    return {
      schedules: raw.schedules ?? [],
      memos: raw.memos ?? [],
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      awayCheck: { ...DEFAULT_AWAY_CHECK, ...raw.awayCheck },
      morningAlertSentDate: raw.morningAlertSentDate,
      trash: raw.trash ?? []
    }
  } catch {
    return { schedules: [], memos: [], settings: { ...DEFAULT_SETTINGS }, awayCheck: { ...DEFAULT_AWAY_CHECK }, trash: [] }
  }
}

function writeData(data: AppData): void {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2))
}

let tray: Tray | null = null
let popupWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let alarmIntervalId: ReturnType<typeof setInterval> | null = null
let scheduledTimers: ReturnType<typeof setTimeout>[] = []
let morningAlertTimer: ReturnType<typeof setTimeout> | null = null
let awayCheckIntervalId: ReturnType<typeof setInterval> | null = null
let trashTimers: ReturnType<typeof setTimeout>[] = []
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

  // 팝업 열 때 놓친 알림 catch-up
  scheduleExactTimers()
  scheduleMorningAlert()

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
    const data = (await response.json()) as { ok: boolean; error?: string }
    if (!data.ok) console.error('[Slack Bot Error]', data)
    return data.ok
  } catch (e) {
    console.error('[Slack Bot Exception]', e)
    return false
  }
}

function sendSlackNotification(settings: Settings, message: string): Promise<boolean> {
  if (settings.slackMethod === 'bot') {
    return sendSlackBot(settings.slackBotToken, settings.slackChannelId, message)
  }
  return sendSlackWebhook(settings.slackWebhookUrl, message)
}

function sendScheduleNotification(schedule: Schedule, missed: boolean, settings: Settings): void {
  const timingText = settings.alertTiming > 0 ? ` (${settings.alertTiming}분 전)` : ''
  const title = missed ? `📌 놓친 알림` : `📌 일정 알림${timingText}`

  if (settings.macNotification) {
    new Notification({
      title: `${title} ${schedule.date} ${schedule.time}`,
      body: schedule.content,
      sound: 'default'
    }).show()
  }

  if (settings.slackEnabled) {
    const prefix = missed ? `📌 *놓친 알림*` : `📌 *일정 알림${timingText}*`
    sendSlackNotification(
      settings,
      `${prefix}\n📅 ${schedule.date} ${schedule.time}\n${schedule.content}`
    )
  }

  const data = readData()
  const target = data.schedules.find((s) => s.id === schedule.id)
  if (target) {
    target.notified = true
    writeData(data)
    sendToAllWindows('schedules-updated', data.schedules)
  }
}

function saveMorningAlertSentDate(dateStr: string): void {
  morningAlertSentDate = dateStr
  const data = readData()
  data.morningAlertSentDate = dateStr
  writeData(data)
}

function scheduleMorningAlert(): void {
  if (morningAlertTimer) {
    clearTimeout(morningAlertTimer)
    morningAlertTimer = null
  }

  const data = readData()
  const { settings } = data
  if (!settings.morningAlertEnabled) return

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (morningAlertSentDate === todayStr) return

  const [mh, mm] = settings.morningAlertTime.split(':').map(Number)
  const morningTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), mh, mm)
  const diff = morningTime.getTime() - now.getTime()

  if (diff < -120000) {
    // 2분 넘게 지남 → 놓친 알림으로 즉시 발송
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
    saveMorningAlertSentDate(todayStr)
  } else if (diff <= 0) {
    // 지금이 알림 시각 ~ +2분 이내 → 즉시 발송
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
    saveMorningAlertSentDate(todayStr)
  } else {
    // 아직 알림 시각 전 → 정확한 시각에 setTimeout 예약
    morningAlertTimer = setTimeout(() => {
      const data = readData()
      const settings = data.settings
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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
      saveMorningAlertSentDate(todayStr)
    }, diff)
  }
}

function cleanupTrash(): void {
  trashTimers.forEach((t) => clearTimeout(t))
  trashTimers = []

  const data = readData()
  const now = Date.now()

  // 이미 만료된 항목 즉시 제거
  const filtered = data.trash.filter((t) => now - new Date(t.deletedAt).getTime() < 86400000)
  if (filtered.length !== data.trash.length) {
    data.trash = filtered
    writeData(data)
    sendToAllWindows('trash-updated', filtered)
  }

  // 아직 만료 안 된 항목 → 정확한 시각에 setTimeout 예약
  filtered.forEach((t) => {
    const remaining = 86400000 - (now - new Date(t.deletedAt).getTime())
    const timer = setTimeout(() => cleanupTrash(), remaining)
    trashTimers.push(timer)
  })
}

function scheduleExactTimers(): void {
  // 기존 타이머 모두 제거
  scheduledTimers.forEach((t) => clearTimeout(t))
  scheduledTimers = []

  const data = readData()
  const { settings } = data
  const now = new Date()
  const alertOffset = settings.alertTiming * 60 * 1000

  data.schedules.forEach((schedule) => {
    if (schedule.notified) return

    const scheduleTime = new Date(schedule.datetime)
    const alertTime = new Date(scheduleTime.getTime() - alertOffset)
    const diff = alertTime.getTime() - now.getTime()

    if (diff <= 0) {
      // 이미 지난 알림 → 즉시 발송 (놓친 알림)
      sendScheduleNotification(schedule, diff < -60000, settings)
    } else if (diff <= 24 * 60 * 60 * 1000) {
      // 24시간 이내 알림 → 정확한 시간에 setTimeout 예약
      const timer = setTimeout(() => {
        sendScheduleNotification(schedule, false, readData().settings)
      }, diff)
      scheduledTimers.push(timer)
    }
    // 24시간 이후 일정은 주기적 체크(setInterval)에서 재설정됨
  })
}

function startAlarmChecker(): void {
  const data = readData()
  const interval = data.settings.checkInterval

  // 정확한 시간에 알림 예약
  scheduleExactTimers()
  scheduleMorningAlert()

  // 주기적 체크 (새로 추가된 일정 반영)
  alarmIntervalId = setInterval(() => {
    // 새로 추가된 일정 반영을 위해 타이머 재설정
    scheduleExactTimers()
    scheduleMorningAlert()
    cleanupTrash()
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

    // 제외 시간대 체크
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const { excludeBeforeWork, beforeWorkTime, excludeLunch, lunchStart, lunchEnd, excludeAfterWork, afterWorkTime, excludeDays } = current.awayCheck
    let excluded = false

    if (excludeDays.length > 0 && excludeDays.includes(now.getDay())) {
      excluded = true
    }
    if (excludeBeforeWork) {
      const [bwh, bwm] = beforeWorkTime.split(':').map(Number)
      if (currentMinutes < bwh * 60 + bwm) {
        excluded = true
      }
    }
    if (excludeLunch) {
      const [lsh, lsm] = lunchStart.split(':').map(Number)
      const [leh, lem] = lunchEnd.split(':').map(Number)
      if (currentMinutes >= lsh * 60 + lsm && currentMinutes < leh * 60 + lem) {
        excluded = true
      }
    }
    if (excludeAfterWork) {
      const [awh, awm] = afterWorkTime.split(':').map(Number)
      if (currentMinutes >= awh * 60 + awm) {
        excluded = true
      }
    }

    // UI에 현재 상태 전송
    sendToAllWindows('idle-status', { idleSeconds, limitSeconds: current.awayCheck.limitMinutes * 60, excluded })

    if (excluded) {
      awayAlertSent = false
      return
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
  morningAlertSentDate = readData().morningAlertSentDate || ''
  cleanupTrash()
  createTray()
  createPopupWindow()
  startAlarmChecker()
  startAwayChecker()

  powerMonitor.on('resume', () => {
    restartAlarmChecker()
    startAwayChecker()
  })

  powerMonitor.on('unlock-screen', () => {
    scheduleExactTimers()
    scheduleMorningAlert()
  })
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
  scheduleExactTimers()
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
  data.settings = settings
  writeData(data)
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

ipcMain.handle('get-trash', () => readData().trash)
ipcMain.handle('save-trash', (_, trash: TrashItem[]) => {
  const data = readData()
  data.trash = trash
  writeData(data)
  sendToAllWindows('trash-updated', trash)
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
    const data = readData()
    const { settings } = data
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const timingText = settings.alertTiming > 0 ? ` (${settings.alertTiming}분 전)` : ''
    const notif = new Notification({
      title: `📌 일정 알림${timingText} ${dateStr} ${timeStr}`,
      body: '알림 테스트',
      sound: 'default'
    })
    notif.on('show', () => resolve({ success: true }))
    notif.on('failed', () => resolve({ success: false }))
    notif.show()

    if (settings.slackEnabled) {
      sendSlackNotification(settings, `📌 *일정 알림${timingText}*\n📅 ${dateStr} ${timeStr}\n알림 테스트`)
    }

    // 3초 타임아웃 - show/failed 둘 다 안 오면 성공으로 간주
    setTimeout(() => resolve({ success: true }), 3000)
  })
})

ipcMain.handle('test-away-notification', () => {
  if (!Notification.isSupported()) {
    return { success: false }
  }
  return new Promise<{ success: boolean }>((resolve) => {
    const data = readData()
    const { settings, awayCheck } = data
    const notif = new Notification({
      title: '⚠️ 이석 경고!',
      body: `${awayCheck.limitMinutes}분 이상 자리를 비웠습니다!`,
      sound: 'default'
    })
    notif.on('show', () => resolve({ success: true }))
    notif.on('failed', () => resolve({ success: false }))
    notif.show()

    if (settings.slackEnabled) {
      sendSlackNotification(settings, `⚠️ *이석 경고!*\n${awayCheck.limitMinutes}분 이상 자리를 비웠습니다!`)
    }

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
