import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage, screen, net, powerMonitor, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import type { AppData, Schedule, Memo, Settings, AwayCheckSettings, TrashItem, DutySettings, SlackMethod, RoutineRule, HolidayCache, HolidayEntry, HolidayShift, HolidayBasis } from '../types'
import { DEFAULT_SETTINGS, DEFAULT_AWAY_CHECK, DEFAULT_DUTY, makeId } from '../types'

let dataPath: string

function readData(): AppData {
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    const rawDuty = (raw.duty ?? {}) as Record<string, unknown>
    // 구버전에 남아있던 파일 경로 필드는 제거
    delete rawDuty.peopleFilePath
    delete rawDuty.assignmentsFilePath
    return {
      schedules: raw.schedules ?? [],
      memos: raw.memos ?? [],
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      awayCheck: { ...DEFAULT_AWAY_CHECK, ...raw.awayCheck },
      morningAlertSentDate: raw.morningAlertSentDate,
      trash: raw.trash ?? [],
      duty: { ...DEFAULT_DUTY, ...rawDuty },
      routines: (raw.routines ?? []).map(normalizeRoutine),
      holidays: raw.holidays,
      skippedVersion: raw.skippedVersion,
      lastUpdateCheckAt: raw.lastUpdateCheckAt
    }
  } catch {
    return {
      schedules: [],
      memos: [],
      settings: { ...DEFAULT_SETTINGS },
      awayCheck: { ...DEFAULT_AWAY_CHECK },
      trash: [],
      duty: { ...DEFAULT_DUTY },
      routines: []
    }
  }
}

// 손상/구버전 규칙이 전개 루프를 깨뜨리지 않도록 방어적으로 정규화
function normalizeRoutine(raw: Record<string, unknown>): RoutineRule {
  const freq = raw.freq === 'weekly' ? 'weekly' : 'monthly'
  const rawDay = raw.monthDay
  const monthDay: number | 'last' =
    rawDay === 'last' ? 'last' : Math.min(31, Math.max(1, Number(rawDay) || 1))
  const weekdays = Array.isArray(raw.weekdays)
    ? [...new Set(raw.weekdays.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
    : [1]
  const shift = raw.holidayShift
  const basis = raw.holidayBasis
  return {
    id: Number(raw.id) || makeId(),
    content: String(raw.content ?? ''),
    time: /^\d{2}:\d{2}$/.test(String(raw.time)) ? String(raw.time) : '10:00',
    enabled: raw.enabled !== false,
    freq,
    monthDay,
    weekdays: weekdays.length > 0 ? weekdays : [1],
    holidayShift: shift === 'next' || shift === 'prev' ? shift : 'none',
    holidayBasis: basis === 'weekend' ? 'weekend' : 'publicHoliday',
    skippedKeys: Array.isArray(raw.skippedKeys) ? raw.skippedKeys.map(String) : [],
    createdAt: String(raw.createdAt ?? new Date().toISOString())
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
let dutyAlertTimer: ReturnType<typeof setTimeout> | null = null
let dutyNextDayTimer: ReturnType<typeof setTimeout> | null = null
let dutyMidnightTimer: ReturnType<typeof setTimeout> | null = null
let awayCheckIntervalId: ReturnType<typeof setInterval> | null = null
let trashTimers: ReturnType<typeof setTimeout>[] = []
let awayAlertSent = false
let morningAlertSentDate = ''
let lastBlurTime = 0
let popupPinned = false
// 이석 체커 폴링(5초마다)에서 디스크 read 회피용 캐시. save handler에서 갱신
let cachedAwayCheck: AwayCheckSettings = { ...DEFAULT_AWAY_CHECK }
let cachedSettings: Settings = { ...DEFAULT_SETTINGS }

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
  scheduleDutyAlert()

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
    { label: '업데이트 확인', click: () => void checkForUpdate(true) },
    { type: 'separator' },
    { label: `버전 ${app.getVersion()}`, enabled: false },
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
  if (!settings.scheduleEnabled) return

  // 진입 가드 + 마킹을 발송 "전"에 처리해서 동시 catch-up 경로의 이중 발송 차단
  const data = readData()
  const target = data.schedules.find((s) => s.id === schedule.id)
  if (!target || target.notified) return
  target.notified = true
  writeData(data)
  sendToAllWindows('schedules-updated', data.schedules)

  const timingText = settings.alertTiming > 0 ? ` (${settings.alertTiming}분 전)` : ''
  const title = missed ? `📌 놓친 알림` : `📌 일정 알림${timingText}`

  new Notification({
    title: `${title} ${schedule.date} ${schedule.time}`,
    body: schedule.content,
    sound: 'default'
  }).show()

  if (settings.slackEnabled) {
    const prefix = missed ? `📌 *놓친 알림*` : `📌 *일정 알림${timingText}*`
    sendSlackNotification(
      settings,
      `${prefix}\n📅 ${schedule.date} ${schedule.time}\n${schedule.content}`
    )
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
    if (todaySchedules.length > 0 && settings.scheduleEnabled) {
      const body = todaySchedules.map((s) => `${s.time} ${s.content}`).join('\n')
      new Notification({
        title: `📋 오늘 일정 (${todaySchedules.length}건)`,
        body,
        sound: 'default'
      }).show()
      if (settings.slackEnabled) {
        sendSlackNotification(settings, `📋 *오늘 일정 (${todaySchedules.length}건)*\n${body}`)
      }
    }
    saveMorningAlertSentDate(todayStr)
  } else if (diff <= 0) {
    // 지금이 알림 시각 ~ +2분 이내 → 즉시 발송
    const todaySchedules = data.schedules.filter((s) => s.date === todayStr)
    if (todaySchedules.length > 0 && settings.scheduleEnabled) {
      const body = todaySchedules.map((s) => `${s.time} ${s.content}`).join('\n')
      new Notification({
        title: `📋 오늘 일정 (${todaySchedules.length}건)`,
        body,
        sound: 'default'
      }).show()
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
      if (todaySchedules.length > 0 && settings.scheduleEnabled) {
        const body = todaySchedules.map((s) => `${s.time} ${s.content}`).join('\n')
        new Notification({
          title: `📋 오늘 일정 (${todaySchedules.length}건)`,
          body,
          sound: 'default'
        }).show()
        if (settings.slackEnabled) {
          sendSlackNotification(settings, `📋 *오늘 일정 (${todaySchedules.length}건)*\n${body}`)
        }
      }
      saveMorningAlertSentDate(todayStr)
    }, diff)
  }
}

function todayDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDutyMention(person: { name: string; slackUserId: string } | undefined): string {
  if (!person) return ''
  const id = person.slackUserId.trim()
  if (id) return `<@${id}>`
  return person.name
}

function formatDutyPlainName(person: { name: string } | undefined): string {
  return person?.name ?? ''
}

const DUTY_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function formatDutyDateLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${DUTY_WEEKDAYS[d.getDay()]}`
}

function buildDutyMessage(
  duty: DutySettings,
  format: 'slack' | 'plain' = 'slack',
  baseDate = new Date()
): string | null {
  const todayStr = todayDateStr(baseDate)
  const tomorrow = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1)
  const tomorrowStr = todayDateStr(tomorrow)

  const peopleOnDate = (dateStr: string): string => {
    const a = duty.assignments.find((x) => x.date === dateStr)
    if (!a || a.personIds.length === 0) return ''
    return a.personIds
      .map((pid) => duty.people.find((p) => p.id === pid))
      .filter((p): p is typeof duty.people[number] => !!p)
      .map((p) => (format === 'slack' ? formatDutyMention(p) : formatDutyPlainName(p)))
      .join(', ')
  }

  const todayLine = peopleOnDate(todayStr)
  const tomorrowLine = peopleOnDate(tomorrowStr)

  if (!todayLine && !tomorrowLine) return null

  const lines: string[] = []
  if (format === 'slack') lines.push('🔔 *당직 알림*')
  if (todayLine) lines.push(`(${formatDutyDateLabel(baseDate)}) 오늘 당직: ${todayLine}`)
  if (tomorrowLine) lines.push(`(${formatDutyDateLabel(tomorrow)}) 내일 당직: ${tomorrowLine}`)
  return lines.join('\n')
}

async function sendSlackByConfig(
  method: SlackMethod,
  webhookUrl: string,
  botToken: string,
  channelId: string,
  message: string
): Promise<boolean> {
  if (method === 'bot') {
    return sendSlackBot(botToken, channelId, message)
  }
  return sendSlackWebhook(webhookUrl, message)
}

function saveDutyLastSentDate(dateStr: string): void {
  const data = readData()
  data.duty.lastSentDate = dateStr
  writeData(data)
  sendToAllWindows('duty-updated', data.duty)
}

function dispatchDutyAlert(): void {
  const data = readData()
  const { duty } = data
  if (!duty.enabled) return

  const todayStr = todayDateStr()
  if (duty.lastSentDate === todayStr) return

  const plainBody = buildDutyMessage(duty, 'plain')
  if (!plainBody) {
    saveDutyLastSentDate(todayStr)
    return
  }

  // mac 알림 (당직 알림 마스터 토글 duty.enabled가 위에서 이미 확인됨)
  new Notification({ title: '🔔 당직 알림', body: plainBody, sound: 'default' }).show()

  // 슬랙 (당직용 별도 설정)
  if (duty.slackEnabled) {
    const slackMessage = buildDutyMessage(duty, 'slack')
    if (slackMessage) {
      sendSlackByConfig(
        duty.slackMethod,
        duty.slackWebhookUrl,
        duty.slackBotToken,
        duty.slackChannelId,
        slackMessage
      )
    }
  }

  saveDutyLastSentDate(todayStr)
}

function scheduleDutyAlert(): void {
  if (dutyAlertTimer) {
    clearTimeout(dutyAlertTimer)
    dutyAlertTimer = null
  }
  if (dutyNextDayTimer) {
    clearTimeout(dutyNextDayTimer)
    dutyNextDayTimer = null
  }

  const data = readData()
  const { duty } = data
  if (!duty.enabled) return

  const now = new Date()
  const todayStr = todayDateStr(now)
  const alreadySentToday = duty.lastSentDate === todayStr

  const [h, m] = duty.alertTime.split(':').map(Number)
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
  const diff = target.getTime() - now.getTime()

  if (!alreadySentToday) {
    if (diff < -120000) {
      // 2분 이상 지남 → 즉시 발송 (놓친 알림)
      dispatchDutyAlert()
    } else if (diff <= 0) {
      // 알림 시각 ~ +2분 → 즉시
      dispatchDutyAlert()
    } else {
      dutyAlertTimer = setTimeout(() => {
        dispatchDutyAlert()
        scheduleDutyNextDay()
      }, diff)
      return
    }
  }
  // 오늘 발송 끝났거나 즉시 발송 후 → 24h 뒤 재예약
  scheduleDutyNextDay()
}

function scheduleDutyNextDay(): void {
  if (dutyNextDayTimer) {
    clearTimeout(dutyNextDayTimer)
    dutyNextDayTimer = null
  }
  // 24시간 후 다시 scheduleDutyAlert (B: 발송 직후 재예약)
  dutyNextDayTimer = setTimeout(() => {
    scheduleDutyAlert()
  }, 24 * 60 * 60 * 1000)
}

function scheduleDutyMidnightTrigger(): void {
  if (dutyMidnightTimer) {
    clearTimeout(dutyMidnightTimer)
    dutyMidnightTimer = null
  }
  // A: 매일 새벽 1시에 강제 재계산 (날짜 바뀐 뒤 lastSentDate 자연 리셋)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 1, 0)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  dutyMidnightTimer = setTimeout(() => {
    scheduleDutyAlert()
    scheduleDutyMidnightTrigger()
  }, next.getTime() - now.getTime())
}

/* ==================== 반복 일정 (Routines) ==================== */

// 토큰 없이 쓸 수 있는 공개 공휴일 API. 실패해도 토·일 판정은 항상 동작한다.
const HOLIDAY_API = 'https://date.nager.at/api/v3/PublicHolidays'
// 규칙을 실제 Schedule로 실체화해두는 범위.
// 매일 자정에 하루씩 밀리며 채워지므로 짧게 잡아도 알림을 놓치지 않는다.
// 길게 잡으면 일정 목록이 반복 일정으로 도배되므로 임박한 것만 띄운다.
// (더 앞의 회차는 반복 일정 모달의 "다음 알림" 미리보기에서 확인)
const ROUTINE_HORIZON_DAYS = 7
// 앱이 꺼져 있는 동안 지나간 발생분을 며칠까지 소급해 "놓친 알림"으로 띄울지.
// 금요일 알림을 월요일에 받는 정도면 충분하다. 길게 잡으면 발송이 끝난 과거 회차가
// 목록에 그대로 쌓여서 전개 범위를 짧게 둔 의미가 없어진다.
const ROUTINE_CATCHUP_DAYS = 3
// 임시공휴일이 뒤늦게 지정되는 경우가 있어 주기적으로 다시 받는다
const HOLIDAY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000

let holidaySet = new Set<string>()
let routineMidnightTimer: ReturnType<typeof setTimeout> | null = null

/** 구버전 캐시는 날짜 문자열 배열이었다 — 읽을 때 흡수한다 */
function normalizeHolidayEntries(raw: unknown): HolidayEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((v) =>
      typeof v === 'string'
        ? { date: v, name: '' }
        : { date: String((v as HolidayEntry)?.date ?? ''), name: String((v as HolidayEntry)?.name ?? '') }
    )
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
}

function allHolidayEntries(cache?: HolidayCache): HolidayEntry[] {
  if (!cache) return []
  return Object.values(cache.years).flatMap(normalizeHolidayEntries)
}

function loadHolidayCache(): void {
  holidaySet = new Set(allHolidayEntries(readData().holidays).map((e) => e.date))
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(s: string, n: number): string {
  const d = parseDateStr(s)
  d.setDate(d.getDate() + n)
  return todayDateStr(d)
}

/**
 * 휴일 판정. basis='weekend'면 토·일만, 'publicHoliday'면 공휴일까지 포함한다.
 * 공휴일 캐시를 못 받아온 상태여도 주말 판정은 항상 동작한다.
 */
function isNonWorkingDay(dateStr: string, basis: HolidayBasis): boolean {
  const day = parseDateStr(dateStr).getDay()
  if (day === 0 || day === 6) return true
  return basis === 'publicHoliday' && holidaySet.has(dateStr)
}

/** 휴일이면 direction 방향 영업일까지 이동. 연휴가 길어도 14일이면 반드시 빠져나온다 */
function shiftToBusinessDay(dateStr: string, direction: HolidayShift, basis: HolidayBasis): string {
  if (direction === 'none') return dateStr
  const step = direction === 'next' ? 1 : -1
  let cur = dateStr
  for (let i = 0; i < 14 && isNonWorkingDay(cur, basis); i++) {
    cur = addDays(cur, step)
  }
  return cur
}

function neededHolidayYears(): number[] {
  const today = todayDateStr()
  const startYear = parseDateStr(today).getFullYear()
  const endYear = parseDateStr(addDays(today, ROUTINE_HORIZON_DAYS)).getFullYear()
  return [...new Set([startYear, endYear])]
}

async function fetchHolidays(years: number[]): Promise<{ ok: boolean; count: number; error?: string }> {
  const cache: HolidayCache = readData().holidays ?? { years: {}, fetchedAt: '' }
  let count = 0
  let lastError = ''

  for (const year of years) {
    try {
      const res = await net.fetch(`${HOLIDAY_API}/${year}/KR`)
      if (!res.ok) {
        lastError = `HTTP ${res.status}`
        continue
      }
      const list = (await res.json()) as { date: string; localName?: string; name?: string; types?: string[] }[]
      if (!Array.isArray(list)) {
        lastError = '응답 형식이 예상과 다릅니다'
        continue
      }
      const seen = new Set<string>()
      const entries: HolidayEntry[] = []
      for (const h of list) {
        if (Array.isArray(h.types) && !h.types.includes('Public')) continue
        if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date) || seen.has(h.date)) continue
        seen.add(h.date)
        entries.push({ date: h.date, name: h.localName || h.name || '' })
      }
      cache.years[String(year)] = entries
      count += entries.length
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  if (count > 0) {
    cache.fetchedAt = new Date().toISOString()
    // fetch 대기 중 다른 쓰기가 있었을 수 있으므로 최신 데이터에 얹는다
    const fresh = readData()
    fresh.holidays = cache
    writeData(fresh)
    holidaySet = new Set(allHolidayEntries(cache).map((e) => e.date))
    return { ok: true, count }
  }
  return { ok: false, count: 0, error: lastError || '네트워크에 연결할 수 없습니다' }
}

/** 필요한 연도가 캐시에 없거나 오래됐으면 받아온다. 실패해도 조용히 넘어간다(주말만 적용) */
async function ensureHolidays(force = false): Promise<{ ok: boolean; count: number; error?: string }> {
  const cache = readData().holidays
  const cached = allHolidayEntries(cache)
  // 이름 없이 날짜만 저장하던 구버전 캐시 → 목록에 이름을 띄우려면 한 번 다시 받아야 한다
  const missingNames = cached.length > 0 && cached.some((e) => !e.name)
  const stale =
    !cache?.fetchedAt ||
    Date.now() - new Date(cache.fetchedAt).getTime() > HOLIDAY_REFRESH_MS ||
    missingNames
  const years = neededHolidayYears()
  const missing = years.filter((y) => !cache?.years?.[String(y)])
  const target = force || stale ? years : missing
  if (target.length === 0) return { ok: true, count: 0 }
  return fetchHolidays(target)
}

interface Occurrence {
  key: string // 시프트 전 기준일 기반 멱등키 — 시프트 정책을 바꿔도 스킵 기록이 유지된다
  baseDate: string // 규칙상 원래 날짜
  date: string // 휴일 보정까지 끝난 실제 알림 날짜
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

/** from~to(포함) 구간의 발생분 계산 */
function expandRoutine(rule: RoutineRule, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = []
  const fromD = parseDateStr(from)
  const toD = parseDateStr(to)

  if (rule.freq === 'weekly') {
    // 요일 고정은 휴일 보정을 하지 않는다 (토요일 과외를 월요일로 밀 수는 없으므로)
    for (const d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
      if (!rule.weekdays.includes(d.getDay())) continue
      const ds = todayDateStr(d)
      out.push({ key: `${rule.id}:${ds}`, baseDate: ds, date: ds })
    }
    return out
  }

  // 시프트로 구간 안팎을 넘나들 수 있으니 앞뒤 한 달씩 여유를 두고 훑는다
  const cursor = new Date(fromD.getFullYear(), fromD.getMonth() - 1, 1)
  const guard = new Date(toD.getFullYear(), toD.getMonth() + 1, 1)
  while (cursor <= guard) {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const last = lastDayOfMonth(y, m)
    // 31일 지정인데 그 달에 없으면 말일로 클램프 — 2월에 조용히 건너뛰는 사고 방지
    const day = rule.monthDay === 'last' ? last : Math.min(rule.monthDay, last)
    const baseDate = todayDateStr(new Date(y, m, day))
    const date = shiftToBusinessDay(baseDate, rule.holidayShift, rule.holidayBasis)
    if (date >= from && date <= to) {
      out.push({ key: `${rule.id}:${baseDate}`, baseDate, date })
    }
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return out
}

/** 규칙을 실제 Schedule로 전개. 이미 있는 발생분과 사용자가 스킵한 건 건너뛴다 */
function materializeRoutines(): boolean {
  const data = readData()
  if (data.routines.length === 0) return false

  const today = todayDateStr()
  const horizon = addDays(today, ROUTINE_HORIZON_DAYS)
  // 앱이 꺼져 있던 동안의 발생분도 훑어야 "놓친 알림"으로 띄울 수 있다
  const catchupFrom = addDays(today, -ROUTINE_CATCHUP_DAYS)
  const existingKeys = new Set(
    data.schedules.map((s) => s.occurrenceKey).filter((k): k is string => !!k)
  )
  const usedIds = new Set(data.schedules.map((s) => s.id))
  const now = Date.now()
  const added: Schedule[] = []

  for (const rule of data.routines) {
    if (!rule.enabled || !rule.content.trim()) continue
    const skipped = new Set(rule.skippedKeys)
    const createdAt = new Date(rule.createdAt).getTime()
    for (const occ of expandRoutine(rule, catchupFrom, horizon)) {
      if (existingKeys.has(occ.key) || skipped.has(occ.key)) continue
      const datetime = new Date(`${occ.date}T${rule.time}`)
      const t = datetime.getTime()
      if (t < now) {
        // 규칙을 만들기 전의 회차까지 소급하면 등록 직후 과거 알림이 쏟아진다
        if (Number.isNaN(createdAt) || t < createdAt) continue
        // 소급 한도를 넘긴 건 이제 와서 알릴 의미가 없다
        if (now - t > ROUTINE_CATCHUP_DAYS * 86400000) continue
      }

      let id = makeId()
      while (usedIds.has(id)) id++
      usedIds.add(id)
      existingKeys.add(occ.key)

      added.push({
        id,
        date: occ.date,
        time: rule.time,
        content: rule.content.trim(),
        datetime: datetime.toISOString(),
        notified: false,
        routineId: rule.id,
        occurrenceKey: occ.key
      })
    }
  }

  if (added.length === 0) return false
  data.schedules = [...data.schedules, ...added]
  writeData(data)
  sendToAllWindows('schedules-updated', data.schedules)
  return true
}

/**
 * 규칙이 바뀐 뒤 호출. 아직 발송되지 않은 미래 자동생성분을 걷어내고 처음부터 다시 전개한다.
 * 이미 발송됐거나(notified) 개별 수정된(detached) 건은 기록이므로 보존한다.
 */
function rematerializeRoutines(): void {
  const data = readData()
  const now = Date.now()
  const before = data.schedules.length

  data.schedules = data.schedules.filter((s) => {
    if (!s.routineId) return true // 손으로 만든 일정
    if (s.detached || s.notified) return true
    return new Date(s.datetime).getTime() <= now
  })

  let changed = data.schedules.length !== before
  if (changed) writeData(data)
  if (materializeRoutines()) changed = true
  if (changed) sendToAllWindows('schedules-updated', readData().schedules)

  scheduleExactTimers()
}

/** 날짜가 바뀌면 지평선이 하루 밀리므로 새 발생분을 채워 넣는다 */
function scheduleRoutineMidnightTrigger(): void {
  if (routineMidnightTimer) {
    clearTimeout(routineMidnightTimer)
    routineMidnightTimer = null
  }
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 5)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)

  routineMidnightTimer = setTimeout(() => {
    void ensureHolidays().finally(() => {
      if (materializeRoutines()) scheduleExactTimers()
      scheduleRoutineMidnightTrigger()
    })
  }, next.getTime() - now.getTime())
}

/* ==================== 업데이트 확인 ==================== */

const UPDATE_API = 'https://api.github.com/repos/bedcoding/todo-alarm/releases/latest'
const RELEASES_PAGE = 'https://github.com/bedcoding/todo-alarm/releases/latest'
// 실제 확인 주기. 급한 업데이트가 아니므로 주 1회면 충분하다
const UPDATE_CHECK_INTERVAL = 7 * 24 * 60 * 60 * 1000
// 주기가 됐는지 살피는 간격. 잠자기로 타이머가 밀려도 이 간격 안에 따라잡는다
const UPDATE_TICK_INTERVAL = 6 * 60 * 60 * 1000
// 기동 직후엔 네트워크가 아직 안 붙어 있을 수 있어 조금 기다렸다 확인한다
const UPDATE_FIRST_CHECK_DELAY = 30000

let updateCheckTimer: ReturnType<typeof setInterval> | null = null

/** "v1.9.9" < "v1.11.0" — 문자열 비교로는 뒤집히므로 숫자로 자리마다 비교 */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

function saveSkippedVersion(tag: string): void {
  const data = readData()
  data.skippedVersion = tag
  writeData(data)
}

function saveLastUpdateCheck(): void {
  const data = readData()
  data.lastUpdateCheckAt = new Date().toISOString()
  writeData(data)
}

/**
 * @param manual 트레이 메뉴에서 직접 누른 경우.
 *   자동 확인은 새 버전이 있을 때만 조용히 알리고, 수동 확인은 최신이어도 결과를 보여준다
 *   (아무 반응이 없으면 버튼이 고장난 것처럼 보인다).
 */
async function checkForUpdate(manual = false): Promise<void> {
  // 자동 확인은 주기가 돌아왔을 때만. 앱을 자주 껐다 켜도 주 1회를 넘기지 않는다
  if (!manual) {
    const last = readData().lastUpdateCheckAt
    if (last) {
      const elapsed = Date.now() - new Date(last).getTime()
      if (!Number.isNaN(elapsed) && elapsed >= 0 && elapsed < UPDATE_CHECK_INTERVAL) return
    }
  }

  let latestTag = ''
  let pageUrl = RELEASES_PAGE
  try {
    const res = await net.fetch(UPDATE_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (res.ok) {
      const json = (await res.json()) as { tag_name?: string; html_url?: string }
      if (typeof json?.tag_name === 'string') {
        latestTag = json.tag_name
        if (typeof json.html_url === 'string') pageUrl = json.html_url
      }
    }
  } catch {
    // 오프라인이거나 API가 죽은 경우 — 자동 확인이라면 조용히 넘어간다
  }

  const current = app.getVersion()

  if (!latestTag) {
    if (manual) {
      void dialog.showMessageBox({
        type: 'warning',
        title: '업데이트 확인',
        message: '업데이트를 확인하지 못했습니다',
        detail: '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
        buttons: ['확인']
      })
    }
    // 실패는 기록하지 않는다 — 다음 기회에 다시 시도해야 한다
    return
  }

  // 여기까지 왔으면 서버 응답을 실제로 받은 것이므로 주기를 리셋한다
  saveLastUpdateCheck()

  if (compareVersions(latestTag, current) <= 0) {
    if (manual) {
      void dialog.showMessageBox({
        type: 'info',
        title: '업데이트 확인',
        message: '최신 버전을 사용 중입니다',
        detail: `현재 버전 ${current}`,
        buttons: ['확인']
      })
    }
    return
  }

  // 건너뛴 버전은 자동 확인에서만 무시한다. 직접 눌렀다면 보여주는 게 맞다
  if (!manual && readData().skippedVersion === latestTag) return

  const buttons = manual
    ? ['다운로드 페이지 열기', '나중에']
    : ['다운로드 페이지 열기', '나중에', '이 버전 건너뛰기']

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '업데이트 알림',
    message: `새 버전 ${latestTag}이(가) 나왔습니다`,
    detail: `현재 ${current} → 최신 ${latestTag.replace(/^v/, '')}`,
    buttons,
    defaultId: 0,
    cancelId: 1
  })

  if (response === 0) shell.openExternal(pageUrl)
  else if (response === 2) saveSkippedVersion(latestTag)
}

function startUpdateChecker(): void {
  if (updateCheckTimer) clearInterval(updateCheckTimer)
  setTimeout(() => void checkForUpdate(false), UPDATE_FIRST_CHECK_DELAY)
  updateCheckTimer = setInterval(() => void checkForUpdate(false), UPDATE_TICK_INTERVAL)
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

  // 반복 규칙을 먼저 실체화해야 아래 타이머 예약에 함께 잡힌다
  materializeRoutines()

  // 정확한 시간에 알림 예약
  scheduleExactTimers()
  scheduleMorningAlert()
  scheduleDutyAlert()

  // 주기적 체크 (새로 추가된 일정 반영)
  alarmIntervalId = setInterval(() => {
    // 새로 추가된 일정 반영을 위해 타이머 재설정
    materializeRoutines()
    scheduleExactTimers()
    scheduleMorningAlert()
    scheduleDutyAlert()
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
  if (!cachedAwayCheck.enabled) return

  awayCheckIntervalId = setInterval(() => {
    if (!cachedAwayCheck.enabled) return

    const idleSeconds = powerMonitor.getSystemIdleTime()

    // 제외 시간대 체크
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const { excludeBeforeWork, beforeWorkTime, excludeLunch, lunchStart, lunchEnd, excludeAfterWork, afterWorkTime, excludeDays } = cachedAwayCheck
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
    sendToAllWindows('idle-status', { idleSeconds, limitSeconds: cachedAwayCheck.limitMinutes * 60, excluded })

    if (excluded) {
      awayAlertSent = false
      return
    }

    if (idleSeconds >= cachedAwayCheck.limitMinutes * 60) {
      if (!awayAlertSent) {
        awayAlertSent = true

        new Notification({
          title: '⚠️ 이석 경고!',
          body: `${cachedAwayCheck.limitMinutes}분 이상 자리를 비웠습니다!`,
          sound: 'default'
        }).show()

        if (cachedSettings.slackEnabled) {
          sendSlackNotification(
            cachedSettings,
            `⚠️ *이석 경고!* ${cachedAwayCheck.limitMinutes}분 이상 자리를 비웠습니다!`
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
  const initial = readData()
  morningAlertSentDate = initial.morningAlertSentDate || ''
  cachedAwayCheck = initial.awayCheck
  cachedSettings = initial.settings
  loadHolidayCache()
  cleanupTrash()
  createTray()
  createPopupWindow()
  startAlarmChecker()
  startAwayChecker()
  scheduleDutyMidnightTrigger()
  scheduleRoutineMidnightTrigger()
  startUpdateChecker()

  // 공휴일은 네트워크가 늦어도 앱 기동을 막지 않는다. 받아온 뒤 시프트를 다시 계산
  void ensureHolidays().then((r) => {
    if (r.ok && r.count > 0) rematerializeRoutines()
  })

  powerMonitor.on('resume', () => {
    restartAlarmChecker()
    startAwayChecker()
  })

  powerMonitor.on('unlock-screen', () => {
    scheduleExactTimers()
    scheduleMorningAlert()
    scheduleDutyAlert()
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
  cachedSettings = settings
  return true
})

ipcMain.handle('get-away-check', () => readData().awayCheck)
ipcMain.handle('save-away-check', (_, awayCheck: AwayCheckSettings) => {
  const data = readData()
  data.awayCheck = awayCheck
  writeData(data)
  cachedAwayCheck = awayCheck
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

ipcMain.handle('get-duty', () => readData().duty)
ipcMain.handle('save-duty', (_, duty: DutySettings) => {
  const data = readData()
  // 날짜가 바뀐 사람/할당이 들어왔을 수 있으니 lastSentDate는 클라이언트 값 무시하고 보존
  const preserved: DutySettings = { ...duty, lastSentDate: data.duty.lastSentDate }
  data.duty = preserved
  writeData(data)
  sendToAllWindows('duty-updated', preserved)
  scheduleDutyAlert()
  return true
})

ipcMain.handle('test-duty-slack', async (_, config: { method: string; webhookUrl: string; botToken: string; channelId: string }) => {
  try {
    const data = readData()
    const message = buildDutyMessage(data.duty, 'slack') ?? '🔔 *당직 알림 테스트*\n오늘/내일 등록된 당직자가 없습니다.'
    const success = config.method === 'bot'
      ? await sendSlackBot(config.botToken, config.channelId, message)
      : await sendSlackWebhook(config.webhookUrl, message)
    return { success }
  } catch {
    return { success: false, error: '전송 실패' }
  }
})

ipcMain.handle('test-duty-dispatch', () => {
  try {
    const data = readData()
    const { duty } = data

    const plainBody = buildDutyMessage(duty, 'plain') ?? '오늘/내일 등록된 당직자가 없습니다.'
    new Notification({ title: '🔔 당직 알림 (테스트)', body: plainBody, sound: 'default' }).show()

    // 슬랙은 fire-and-forget (응답 기다리지 않음) — 일정/이석 테스트와 동일한 패턴
    if (duty.slackEnabled) {
      const slackMessage = buildDutyMessage(duty, 'slack') ?? '🔔 *당직 알림 테스트*\n오늘/내일 등록된 당직자가 없습니다.'
      sendSlackByConfig(
        duty.slackMethod,
        duty.slackWebhookUrl,
        duty.slackBotToken,
        duty.slackChannelId,
        slackMessage
      )
    }

    return { success: true, slackAttempted: duty.slackEnabled }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '테스트 발송 실패' }
  }
})

ipcMain.handle('reset-duty-last-sent', () => {
  const data = readData()
  data.duty.lastSentDate = ''
  writeData(data)
  sendToAllWindows('duty-updated', data.duty)
  scheduleDutyAlert()
  return true
})

/* ---------- 반복 일정 ---------- */

ipcMain.handle('get-routines', () => readData().routines)

ipcMain.handle('save-routines', (_, routines: RoutineRule[]) => {
  const data = readData()
  data.routines = (routines ?? []).map((r) => normalizeRoutine(r as unknown as Record<string, unknown>))
  writeData(data)
  sendToAllWindows('routines-updated', data.routines)
  rematerializeRoutines()
  return true
})

/** 반복 인스턴스를 개별 삭제했을 때 — 다음 전개에서 되살아나지 않도록 기록 */
ipcMain.handle('skip-occurrence', (_, routineId: number, occurrenceKey: string) => {
  const data = readData()
  const rule = data.routines.find((r) => r.id === routineId)
  if (!rule || rule.skippedKeys.includes(occurrenceKey)) return false
  rule.skippedKeys.push(occurrenceKey)
  writeData(data)
  sendToAllWindows('routines-updated', data.routines)
  return true
})

/** 삭제 되돌리기 */
ipcMain.handle('unskip-occurrence', (_, routineId: number, occurrenceKey: string) => {
  const data = readData()
  const rule = data.routines.find((r) => r.id === routineId)
  if (!rule) return false
  rule.skippedKeys = rule.skippedKeys.filter((k) => k !== occurrenceKey)
  writeData(data)
  sendToAllWindows('routines-updated', data.routines)
  return true
})

ipcMain.handle('get-holidays', () => {
  const cache = readData().holidays
  const entries = allHolidayEntries(cache).sort((a, b) => a.date.localeCompare(b.date))
  return { entries, fetchedAt: cache?.fetchedAt, offline: entries.length === 0 }
})

ipcMain.handle('refresh-holidays', async () => {
  const result = await ensureHolidays(true)
  if (result.ok) rematerializeRoutines()
  return { success: result.ok, count: result.count, error: result.error }
})

/** 규칙 편집 중 "실제로 언제 울리는지"를 보여주기 위한 미리보기 */
ipcMain.handle('preview-routine', (_, rule: RoutineRule) => {
  const r = normalizeRoutine(rule as unknown as Record<string, unknown>)
  const today = todayDateStr()
  const span = r.freq === 'weekly' ? 35 : 400
  return expandRoutine(r, today, addDays(today, span))
    .slice(0, 4)
    .map((o) => ({
      date: o.date,
      shifted: o.date !== o.baseDate,
      reason: o.date !== o.baseDate ? o.baseDate : undefined
    }))
})

interface DutyApiMember {
  id: number
  name: string
  slackId?: string
  team?: string
  color?: string
  sortOrder?: number
}
interface DutyApiAssignee {
  memberId: number
  name?: string
  slackId?: string
  team?: string
  color?: string
}
interface DutyApiDay {
  date: string
  assignees: DutyApiAssignee[]
}
interface DutyApiResponse {
  month?: string
  duties?: DutyApiDay[]
  members?: DutyApiMember[]
}

function randomDutyColor(): string {
  const hue = Math.floor(Math.random() * 360)
  const saturation = 40 + Math.floor(Math.random() * 51)
  const lightness = 50 + Math.floor(Math.random() * 29)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

function applyDutyRoster(payload: DutyApiResponse, opts: { apiUrl?: string }): {
  success: boolean
  error?: string
  peopleCount?: number
  assignmentsCount?: number
  month?: string
  syncedAt?: string
} {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: '응답 형식이 올바르지 않습니다.' }
  }
  if (!Array.isArray(payload.duties)) {
    return { success: false, error: 'duties 배열이 없습니다.' }
  }

  const memberMap = new Map<number, DutyApiMember>()
  if (Array.isArray(payload.members)) {
    for (const m of payload.members) {
      if (typeof m?.id === 'number') memberMap.set(m.id, m)
    }
  }
  for (const day of payload.duties) {
    if (!Array.isArray(day?.assignees)) continue
    for (const a of day.assignees) {
      if (typeof a?.memberId === 'number' && !memberMap.has(a.memberId)) {
        memberMap.set(a.memberId, {
          id: a.memberId,
          name: a.name ?? `member_${a.memberId}`,
          slackId: a.slackId,
          team: a.team,
          color: a.color
        })
      }
    }
  }

  if (memberMap.size === 0) {
    return { success: false, error: '멤버 정보가 없습니다.' }
  }

  const data = readData()
  const existingById = new Map(data.duty.people.map((p) => [p.id, p]))

  const sorted = [...memberMap.values()].sort((a, b) => {
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    return a.id - b.id
  })

  const people = sorted.map((m) => {
    const id = `p_${m.id}`
    const existing = existingById.get(id)
    return {
      id,
      name: m.name,
      slackUserId: m.slackId ?? existing?.slackUserId ?? '',
      color: existing?.color ?? m.color ?? randomDutyColor()
    }
  })

  const validIds = new Set(people.map((p) => p.id))
  const assignments = payload.duties
    .filter((d) => typeof d?.date === 'string' && Array.isArray(d.assignees) && d.assignees.length > 0)
    .map((d, idx) => ({
      id: `a_${d.date}_${idx}`,
      date: d.date,
      personIds: d.assignees
        .map((a) => `p_${a.memberId}`)
        .filter((pid) => validIds.has(pid))
    }))
    .filter((e) => e.personIds.length > 0)

  const syncedAt = new Date().toISOString()
  data.duty = {
    ...data.duty,
    people,
    assignments,
    apiUrl: opts.apiUrl ?? data.duty.apiUrl,
    lastApiSyncAt: syncedAt
  }
  writeData(data)
  sendToAllWindows('duty-updated', data.duty)
  scheduleDutyAlert()
  return {
    success: true,
    peopleCount: people.length,
    assignmentsCount: assignments.length,
    month: typeof payload.month === 'string' ? payload.month : undefined,
    syncedAt
  }
}

ipcMain.handle(
  'apply-duty-api',
  async (_, input: { mode: 'url'; url: string } | { mode: 'paste'; payload: string }) => {
    try {
      if (input?.mode === 'url') {
        const url = (input.url ?? '').trim()
        if (!url) return { success: false, error: 'URL을 입력하세요.' }
        let parsed: URL
        try {
          parsed = new URL(url)
        } catch {
          return { success: false, error: '올바른 URL이 아닙니다.' }
        }
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return { success: false, error: 'http(s) URL만 허용됩니다.' }
        }
        const response = await net.fetch(url, { method: 'GET' })
        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` }
        }
        const json = (await response.json()) as DutyApiResponse
        return applyDutyRoster(json, { apiUrl: url })
      }

      if (input?.mode === 'paste') {
        const raw = (input.payload ?? '').trim()
        if (!raw) return { success: false, error: '붙여넣을 JSON이 비어 있습니다.' }
        let json: DutyApiResponse
        try {
          json = JSON.parse(raw) as DutyApiResponse
        } catch (e) {
          return { success: false, error: `JSON 파싱 실패: ${e instanceof Error ? e.message : ''}` }
        }
        return applyDutyRoster(json, { apiUrl: undefined })
      }

      return { success: false, error: '알 수 없는 입력 모드입니다.' }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : '가져오기 실패' }
    }
  }
)
