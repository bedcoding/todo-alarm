import { useState } from 'react'

interface CalendarProps {
  scheduleDates: string[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

export default function Calendar({ scheduleDates, selectedDate, onSelectDate }: CalendarProps) {
  const [viewDate, setViewDate] = useState(new Date())

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const days: JSX.Element[] = []
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="calendar-day empty" />)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const hasSchedule = scheduleDates.includes(dateStr)
    const isToday = dateStr === todayStr
    const isSelected = dateStr === selectedDate
    const isSunday = new Date(year, month, day).getDay() === 0
    const isSaturday = new Date(year, month, day).getDay() === 6

    days.push(
      <div
        key={day}
        className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isSunday ? 'sunday' : ''} ${isSaturday ? 'saturday' : ''}`}
        onClick={() => onSelectDate(dateStr)}
      >
        <span className="day-number">{day}</span>
        {hasSchedule && <span className="dot" />}
      </div>
    )
  }

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button onClick={prevMonth}>&lt;</button>
        <span>
          {year}년 {month + 1}월
        </span>
        <button onClick={nextMonth}>&gt;</button>
      </div>
      <div className="calendar-weekdays">
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
          <div key={d} className={`weekday ${d === '일' ? 'sunday' : ''} ${d === '토' ? 'saturday' : ''}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="calendar-grid">{days}</div>
    </div>
  )
}
