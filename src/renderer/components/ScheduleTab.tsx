import { useState } from 'react'
import Calendar from './Calendar'
import EmptyBell from './EmptyBell'
import TimePicker from './TimePicker'
import type { Schedule, Settings } from '../../types'

function getToday(): string {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

function getNowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface ScheduleTabProps {
  schedules: Schedule[]
  onSave: (schedules: Schedule[]) => void
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  isPopup: boolean
}

export default function ScheduleTab({ schedules, onSave, settings, onSettingsChange, isPopup }: ScheduleTabProps) {
  const [date, setDate] = useState(getToday)
  const [time, setTime] = useState(getNowTime)
  const [content, setContent] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [notifTest, setNotifTest] = useState<'idle' | 'success' | 'denied'>('idle')
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editContent, setEditContent] = useState('')

  const addSchedule = () => {
    if (!date || !time || !content.trim()) return

    const datetime = new Date(`${date}T${time}`)
    const newSchedule: Schedule = {
      id: Date.now(),
      date,
      time,
      content: content.trim(),
      datetime: datetime.toISOString(),
      notified: false
    }

    onSave([...schedules, newSchedule])
    setDate(getToday())
    setTime(getNowTime())
    setContent('')
  }

  const removeSchedule = (id: number) => {
    onSave(schedules.filter((s) => s.id !== id))
  }

  const startEdit = (s: Schedule) => {
    setEditingSchedule(s)
    setEditDate(s.date)
    setEditTime(s.time)
    setEditContent(s.content)
  }

  const saveEdit = () => {
    if (!editingSchedule || !editDate || !editTime || !editContent.trim()) return
    const datetime = new Date(`${editDate}T${editTime}`)
    onSave(schedules.map((s) => s.id === editingSchedule.id ? {
      ...s,
      date: editDate,
      time: editTime,
      content: editContent.trim(),
      datetime: datetime.toISOString()
    } : s))
    setEditingSchedule(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSchedule()
  }

  const filteredSchedules = selectedDate
    ? schedules.filter((s) => s.date === selectedDate)
    : [...schedules].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())

  const scheduleDates = schedules.map((s) => s.date)

  const formatDisplayDate = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00')
    const month = d.getMonth() + 1
    const day = d.getDate()
    const weekdays = ['일', '월', '화', '수', '목', '금', '토']
    const weekday = weekdays[d.getDay()]
    return `${month}/${day}(${weekday})`
  }

  const formatTime = (timeStr: string): string => {
    const [h, m] = timeStr.split(':')
    return `${h}:${m}`
  }

  const isPast = (datetime: string): boolean => new Date(datetime) < new Date()

  return (
    <div className={`schedule-tab ${isPopup ? 'popup-layout' : ''}`}>
      <div className="schedule-left">
        <div className={`input-area ${isPopup ? 'popup-input' : ''}`}>
          <div className={`input-row ${isPopup ? 'picker-anchor' : ''}`}>
            <button
              className="date-picker-btn"
              onClick={() => { setShowDatePicker(!showDatePicker); setShowTimePicker(false) }}
            >
              {formatDisplayDate(date)}
            </button>
            <button
              className="time-picker-btn"
              onClick={() => { setShowTimePicker(!showTimePicker); setShowDatePicker(false) }}
            >
              {time}
            </button>
            {showDatePicker && (
              <>
                <div className="picker-overlay" onClick={() => setShowDatePicker(false)} />
                <div className={`picker-dropdown ${isPopup ? 'picker-inline' : 'picker-center'}`}>
                  <Calendar
                    scheduleDates={scheduleDates}
                    selectedDate={date}
                    onSelectDate={(d) => { setDate(d); setShowDatePicker(false) }}
                  />
                  <button className="picker-close-btn" onClick={() => setShowDatePicker(false)}>닫기</button>
                </div>
              </>
            )}
            {showTimePicker && (
              <>
                <div className="picker-overlay" onClick={() => setShowTimePicker(false)} />
                <div className={`picker-dropdown ${isPopup ? 'picker-inline' : 'picker-center'}`}>
                  <TimePicker value={time} onChange={setTime} />
                  <button className="picker-close-btn" onClick={() => setShowTimePicker(false)}>닫기</button>
                </div>
              </>
            )}
          </div>
          <div className={`input-row ${isPopup ? 'picker-anchor' : ''}`}>
            <input
              type="text"
              placeholder="일정 내용"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="add-btn" onClick={addSchedule}>
              추가
            </button>
          </div>
        </div>

        {selectedDate && (
          <div className="filter-info">
            <span>{formatDisplayDate(selectedDate)} 일정만 보기</span>
            <button className="clear-filter" onClick={() => setSelectedDate(null)}>
              전체 보기
            </button>
          </div>
        )}

        <div className="schedule-list">
          {filteredSchedules.length === 0 ? (
            selectedDate ? (
              <div className="empty">해당 날짜에 일정이 없습니다</div>
            ) : (
              <EmptyBell message="일정을 추가해보세요" />
            )
          ) : (
            filteredSchedules.map((s) => (
              <div
                key={s.id}
                className={`schedule-item ${isPast(s.datetime) ? 'past' : ''} ${s.notified ? 'notified' : ''}`}
              >
                <div className="schedule-info">
                  <span className="schedule-date">{formatDisplayDate(s.date)}</span>
                  <span className="schedule-time">{formatTime(s.time)}</span>
                  <span className="schedule-content">{s.content}</span>
                </div>
                <button className="edit-btn" onClick={() => startEdit(s)}>✎</button>
                <button className="delete-btn" onClick={() => removeSchedule(s.id)}>×</button>
              </div>
            ))
          )}
        </div>

      </div>

      {!isPopup && (
        <div className="schedule-right">
          <Calendar
            scheduleDates={scheduleDates}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
          />
        </div>
      )}

      {isPopup && (
        <>
          <button
            className={`calendar-fab ${showCalendar ? 'active' : ''}`}
            onClick={() => setShowCalendar(!showCalendar)}
            title="특정 날짜만 일정 조회하기"
          >
            📅
          </button>
          {showCalendar && (
            <>
              <div className="picker-overlay" onClick={() => setShowCalendar(false)} />
              <div className="settings-modal">
                <div className="settings-modal-title">특정 날짜만 일정 조회하기</div>
                <Calendar
                  scheduleDates={scheduleDates}
                  selectedDate={selectedDate}
                  onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
                />
                <button className="picker-close-btn" onClick={() => setShowCalendar(false)}>닫기</button>
              </div>
            </>
          )}
        </>
      )}

      {editingSchedule && (
        <>
          <div className="picker-overlay" onClick={() => setEditingSchedule(null)} />
          <div className="settings-modal">
            <div className="settings-modal-title">일정 수정</div>
            <div className="edit-schedule-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="time-input"
                style={{ width: '100%' }}
              />
              <input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="time-input"
                style={{ width: '100%' }}
              />
              <input
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveEdit() }}
                className="time-input"
                placeholder="일정 내용"
                style={{ width: '100%' }}
                autoFocus
              />
            </div>
            <button className="picker-close-btn" style={{ background: 'rgba(233,69,96,0.15)', color: '#e94560' }} onClick={saveEdit}>저장</button>
            <button className="picker-close-btn" onClick={() => setEditingSchedule(null)}>취소</button>
          </div>
        </>
      )}

      <button className="inline-settings-toggle" onClick={() => setShowSettings(true)}>
        알림 설정
      </button>

      {showSettings && (
        <>
          <div className="picker-overlay" onClick={() => setShowSettings(false)} />
          <div className="settings-modal">
            <div className="settings-modal-title">
              <span className="settings-tooltip-wrap">
                <span className="settings-tooltip-icon">?</span>
                <span className="settings-tooltip-text">잠자기 상태에서는 알림이 발송되지 않습니다.<br />놓친 알림은 복귀 시 자동으로 발송됩니다.</span>
              </span>
              알림 설정
            </div>
            <div className="settings-row">
              <label>macOS 알림</label>
              <div
                className={`toggle ${settings.macNotification ? 'on' : ''}`}
                onClick={() => onSettingsChange({ macNotification: !settings.macNotification })}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            <div className="settings-row">
              <label>알림 타이밍</label>
              <select
                value={settings.alertTiming}
                onChange={(e) => onSettingsChange({ alertTiming: Number(e.target.value) })}
              >
                <option value={0}>정시</option>
                <option value={5}>5분 전</option>
                <option value={10}>10분 전</option>
                <option value={30}>30분 전</option>
              </select>
            </div>
            <div className="settings-row">
              <label>감지 간격</label>
              <select
                value={settings.checkInterval}
                onChange={(e) => onSettingsChange({ checkInterval: Number(e.target.value) })}
              >
                <option value={30000}>30초</option>
                <option value={60000}>1분</option>
                <option value={180000}>3분</option>
                <option value={300000}>5분</option>
              </select>
            </div>
            <hr className="settings-divider" />
            <div className="settings-row">
              <label>오늘 일정 알림</label>
              <div
                className={`toggle ${settings.morningAlertEnabled ? 'on' : ''}`}
                onClick={() => onSettingsChange({ morningAlertEnabled: !settings.morningAlertEnabled })}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            {settings.morningAlertEnabled && (
              <div className="settings-row">
                <label>알림 시각</label>
                <input
                  type="time"
                  value={settings.morningAlertTime}
                  onChange={(e) => onSettingsChange({ morningAlertTime: e.target.value })}
                  className="time-input"
                />
              </div>
            )}
            <div className="settings-row">
              <button className="test-notification-btn" onClick={async () => {
                const result = await window.api.testNotification()
                setNotifTest(result.success ? 'success' : 'denied')
                setTimeout(() => setNotifTest('idle'), 3000)
              }}>
                {notifTest === 'success' ? '알림 전송됨' : notifTest === 'denied' ? '알림 차단됨' : '알림 테스트'}
              </button>
            </div>
            <button className="picker-close-btn" onClick={() => setShowSettings(false)}>닫기</button>
          </div>
        </>
      )}
    </div>
  )
}
