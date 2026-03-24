import { useState } from 'react'
import Calendar from './Calendar'
import EmptyBell from './EmptyBell'
import type { Schedule } from '../../types'

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
  isPopup: boolean
}

export default function ScheduleTab({ schedules, onSave, isPopup }: ScheduleTabProps) {
  const [date, setDate] = useState(getToday)
  const [time, setTime] = useState(getNowTime)
  const [content, setContent] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addSchedule()
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
    const hour = parseInt(h)
    const period = hour < 12 ? '오전' : '오후'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${period} ${displayHour}시${m !== '00' ? ` ${m}분` : ''}`
  }

  const isPast = (datetime: string): boolean => new Date(datetime) < new Date()

  return (
    <div className={`schedule-tab ${isPopup ? 'popup-layout' : ''}`}>
      <div className="schedule-left">
        <div className={`input-area ${isPopup ? 'popup-input' : ''}`}>
          <div className="input-row">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="input-row">
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
            {isPopup && (
              <button
                className={`calendar-toggle-btn ${showCalendar ? 'active' : ''}`}
                onClick={() => setShowCalendar(!showCalendar)}
                title="달력 보기"
              >
                📅
              </button>
            )}
          </div>
        </div>

        {isPopup && showCalendar && (
          <div className="popup-calendar">
            <Calendar
              scheduleDates={scheduleDates}
              selectedDate={selectedDate}
              onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
            />
          </div>
        )}

        {selectedDate && (
          <div className="filter-info">
            <span>{formatDisplayDate(selectedDate)} 일정</span>
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
                <button className="delete-btn" onClick={() => removeSchedule(s.id)}>
                  ×
                </button>
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
    </div>
  )
}
