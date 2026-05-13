import { useState } from 'react'
import type { DutySettings, DutyPerson } from '../../types'
import ConfirmDialog from './ConfirmDialog'

interface DutyTabProps {
  duty: DutySettings
  onSave: (duty: DutySettings) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function randomColor(): string {
  const hue = Math.floor(Math.random() * 360)
  const saturation = 40 + Math.floor(Math.random() * 51) // 40-90
  const lightness = 50 + Math.floor(Math.random() * 29)  // 50-78
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

function dateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  const t = new Date()
  return dateStr(t.getFullYear(), t.getMonth(), t.getDate())
}

function getDutyAlertStatus(duty: DutySettings): string {
  if (!duty.enabled) return '⏸ 당직 알림 꺼져 있음'
  const today = todayStr()
  const [h, m] = duty.alertTime.split(':').map(Number)
  const timeLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
  const sentToday = duty.lastSentDate === today
  if (sentToday) {
    return `✓ 오늘 이미 발송됨 · 다음 발송: 내일 ${timeLabel}`
  }
  if (target.getTime() > now.getTime()) {
    return `→ 다음 발송: 오늘 ${timeLabel}`
  }
  return `→ 곧 발송 예정 (오늘 ${timeLabel} 지남, 잠시 후 자동 발송)`
}

export default function DutyTab({ duty, onSave }: DutyTabProps) {
  const [newName, setNewName] = useState('')
  const [newSlackId, setNewSlackId] = useState('')
  const [draggingPersonId, setDraggingPersonId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'fail'>('idle')
  const [showSettings, setShowSettings] = useState(false)
  const [personToDelete, setPersonToDelete] = useState<DutyPerson | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [applyStatus, setApplyStatus] = useState<{ kind: 'idle' | 'loading' | 'success' | 'fail'; msg?: string }>({ kind: 'idle' })
  const peoplePoolCollapsed = duty.peoplePoolCollapsed
  const togglePeoplePool = () => onSave({ ...duty, peoplePoolCollapsed: !duty.peoplePoolCollapsed })
  const peoplePath = duty.peopleFilePath
  const assignmentsPath = duty.assignmentsFilePath
  const setPeoplePath = (v: string) => onSave({ ...duty, peopleFilePath: v })
  const setAssignmentsPath = (v: string) => onSave({ ...duty, assignmentsFilePath: v })
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const slackConfigured = duty.slackMethod === 'webhook'
    ? duty.slackWebhookUrl.trim().length > 0
    : duty.slackBotToken.trim().length > 0 && duty.slackChannelId.trim().length > 0

  const pickFile = async (kind: 'people' | 'assignments') => {
    const result = await window.api.pickFile(kind)
    if (result.canceled || !result.path) return
    if (kind === 'people') setPeoplePath(result.path)
    else setAssignmentsPath(result.path)
  }

  const handleApply = async () => {
    if (!peoplePath.trim() || !assignmentsPath.trim()) {
      setApplyStatus({ kind: 'fail', msg: '두 파일 경로를 모두 입력하세요' })
      setTimeout(() => setApplyStatus({ kind: 'idle' }), 3000)
      return
    }
    setApplyStatus({ kind: 'loading' })
    const result = await window.api.applyDutyFiles({
      peopleFilePath: peoplePath.trim(),
      assignmentsFilePath: assignmentsPath.trim()
    })
    if (result.success) {
      setApplyStatus({
        kind: 'success',
        msg: `사람 ${result.peopleCount}명 · 배정 ${result.assignmentsCount}일 반영됨`
      })
    } else {
      setApplyStatus({ kind: 'fail', msg: result.error ?? '실패' })
    }
    setTimeout(() => setApplyStatus({ kind: 'idle' }), 4000)
  }

  const handleTest = async () => {
    if (!slackConfigured) return
    setTestStatus('loading')
    const result = await window.api.testDutySlack({
      method: duty.slackMethod,
      webhookUrl: duty.slackWebhookUrl,
      botToken: duty.slackBotToken,
      channelId: duty.slackChannelId
    })
    setTestStatus(result.success ? 'success' : 'fail')
    setTimeout(() => setTestStatus('idle'), 3000)
  }

  const addPerson = () => {
    const name = newName.trim()
    if (!name) return
    const newPerson: DutyPerson = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      slackUserId: newSlackId.trim(),
      color: randomColor()
    }
    onSave({ ...duty, people: [...duty.people, newPerson] })
    setNewName('')
    setNewSlackId('')
  }

  const recolorPerson = (personId: string) => {
    onSave({
      ...duty,
      people: duty.people.map((p) =>
        p.id === personId ? { ...p, color: randomColor() } : p
      )
    })
  }

  const removePerson = (personId: string) => {
    onSave({
      ...duty,
      people: duty.people.filter((p) => p.id !== personId),
      assignments: duty.assignments
        .map((a) => ({ ...a, personIds: a.personIds.filter((id) => id !== personId) }))
        .filter((a) => a.personIds.length > 0)
    })
  }

  const clearAll = () => {
    onSave({ ...duty, people: [], assignments: [] })
  }

  const toggleAssignment = (dateString: string, personId: string) => {
    const existing = duty.assignments.find((a) => a.date === dateString)
    let newAssignments
    if (existing) {
      if (existing.personIds.includes(personId)) {
        const updated = { ...existing, personIds: existing.personIds.filter((id) => id !== personId) }
        newAssignments = updated.personIds.length === 0
          ? duty.assignments.filter((a) => a.id !== existing.id)
          : duty.assignments.map((a) => (a.id === existing.id ? updated : a))
      } else {
        newAssignments = duty.assignments.map((a) =>
          a.id === existing.id ? { ...a, personIds: [...a.personIds, personId] } : a
        )
      }
    } else {
      newAssignments = [
        ...duty.assignments,
        { id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, date: dateString, personIds: [personId] }
      ]
    }
    onSave({ ...duty, assignments: newAssignments })
  }

  const handleDragStart = (e: React.DragEvent, personId: string) => {
    setDraggingPersonId(personId)
    e.dataTransfer.effectAllowed = 'copy'
    // Firefox는 setData 필요
    e.dataTransfer.setData('text/plain', personId)
  }

  const handleDragEnd = () => {
    setDraggingPersonId(null)
    setDragOverDate(null)
  }

  const handleCellDragOver = (e: React.DragEvent, dateString: string) => {
    if (draggingPersonId == null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (dragOverDate !== dateString) setDragOverDate(dateString)
  }

  const handleCellDragLeave = (dateString: string) => {
    if (dragOverDate === dateString) setDragOverDate(null)
  }

  const handleCellDrop = (e: React.DragEvent, dateString: string) => {
    e.preventDefault()
    const personIdStr = e.dataTransfer.getData('text/plain')
    const personId = personIdStr || draggingPersonId
    setDraggingPersonId(null)
    setDragOverDate(null)
    if (!personId) return
    toggleAssignment(dateString, personId)
  }

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1)
      setViewMonth(11)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1)
      setViewMonth(0)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  // 달력 셀 만들기
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const lastDate = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: Array<{ date: number | null; dateString: string }> = []
  for (let i = 0; i < firstDay; i++) cells.push({ date: null, dateString: '' })
  for (let d = 1; d <= lastDate; d++) {
    cells.push({ date: d, dateString: dateStr(viewYear, viewMonth, d) })
  }

  const todayDS = todayStr()
  const peopleById = new Map(duty.people.map((p) => [p.id, p]))

  return (
    <div className="duty-tab">
      <button
        className="duty-section-header"
        onClick={togglePeoplePool}
        type="button"
      >
        <span className="duty-section-arrow">{peoplePoolCollapsed ? '▶' : '▼'}</span>
        <span>당직자 ({duty.people.length})</span>
      </button>

      {!peoplePoolCollapsed && (
        <>
          <div className="duty-add-person">
            <input
              type="text"
              placeholder="이름"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPerson()}
            />
            <input
              type="text"
              placeholder="슬랙 ID (선택)"
              value={newSlackId}
              onChange={(e) => setNewSlackId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPerson()}
            />
            <button onClick={addPerson} disabled={!newName.trim()}>추가</button>
          </div>

          <div className="duty-people-pool">
            {duty.people.length === 0 ? (
              <div className="duty-guide">
                위에서 당직자를 추가한 뒤 달력으로 드래그하세요
              </div>
            ) : (
              duty.people.map((p) => (
                <div
                  key={p.id}
                  className={`duty-chip ${draggingPersonId === p.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, p.id)}
                  onDragEnd={handleDragEnd}
                  title={p.slackUserId ? `슬랙 ID: ${p.slackUserId} — 드래그해서 달력에 배정` : '슬랙 ID 미설정 — 드래그해서 달력에 배정'}
                  style={{ '--person-color': p.color } as React.CSSProperties}
                >
                  <span
                    className="duty-chip-dot"
                    title="클릭하여 색상 변경"
                    onClick={(e) => {
                      e.stopPropagation()
                      recolorPerson(p.id)
                    }}
                  />
                  <span className="duty-chip-name">{p.name}</span>
                  {p.slackUserId && <span className="duty-chip-id">@</span>}
                  <span
                    className="duty-chip-remove"
                    draggable={false}
                    onDragStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPersonToDelete(p)
                    }}
                  >
                    ×
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div className="duty-calendar">
        <div className="duty-calendar-header">
          <button onClick={goPrevMonth} className="duty-calendar-nav">‹</button>
          <span>{viewYear}년 {viewMonth + 1}월</span>
          <button onClick={goNextMonth} className="duty-calendar-nav">›</button>
        </div>
        <div className="duty-calendar-grid">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`duty-weekday ${i === 0 ? 'sunday' : ''} ${i === 6 ? 'saturday' : ''}`}>
              {w}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (cell.date == null) return <div key={i} className="duty-day empty" />
            const assignment = duty.assignments.find((a) => a.date === cell.dateString)
            const isToday = cell.dateString === todayDS
            const dow = (firstDay + cell.date - 1) % 7
            const isDragOver = dragOverDate === cell.dateString
            return (
              <div
                key={i}
                className={`duty-day ${isToday ? 'today' : ''} ${isDragOver ? 'drag-over' : ''} ${dow === 0 ? 'sunday' : ''} ${dow === 6 ? 'saturday' : ''}`}
                onDragOver={(e) => handleCellDragOver(e, cell.dateString)}
                onDragLeave={() => handleCellDragLeave(cell.dateString)}
                onDrop={(e) => handleCellDrop(e, cell.dateString)}
              >
                <div className="duty-day-number">{cell.date}</div>
                {assignment && assignment.personIds.length > 0 && (
                  <div className="duty-day-names">
                    {assignment.personIds.map((id) => {
                      const person = peopleById.get(id)
                      if (!person) return null
                      return (
                        <span
                          key={id}
                          className="duty-day-name-tag"
                          title="클릭하여 제거"
                          onClick={() => toggleAssignment(cell.dateString, id)}
                          style={{ color: person.color }}
                        >
                          {person.name}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <button className="inline-settings-toggle" onClick={() => setShowSettings(true)}>
        당직 알림 설정
      </button>

      {personToDelete && (
        <ConfirmDialog
          message={`${personToDelete.name} 삭제할까요? 모든 당직 배정도 함께 제거됩니다.`}
          confirmLabel="삭제"
          onConfirm={() => {
            removePerson(personToDelete.id)
            setPersonToDelete(null)
          }}
          onCancel={() => setPersonToDelete(null)}
        />
      )}

      {confirmClearAll && (
        <ConfirmDialog
          message={`등록된 당직자 ${duty.people.length}명과 모든 배정을 전부 삭제할까요?`}
          confirmLabel="전체 삭제"
          onConfirm={() => {
            clearAll()
            setConfirmClearAll(false)
          }}
          onCancel={() => setConfirmClearAll(false)}
        />
      )}

      {showSettings && (
        <>
          <div className="picker-overlay" onClick={() => setShowSettings(false)} />
          <div className="settings-modal">
            <div className="settings-modal-title">당직 알림 설정</div>
            <div className="settings-row">
              <label>당직 알림</label>
              <div
                className={`toggle ${duty.enabled ? 'on' : ''}`}
                onClick={() => onSave({ ...duty, enabled: !duty.enabled })}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            <div className="settings-row">
              <label>알림 시각</label>
              <input
                type="time"
                value={duty.alertTime}
                onChange={(e) => onSave({ ...duty, alertTime: e.target.value })}
                onClick={(e) => {
                  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void }
                  el.showPicker?.()
                }}
                className="time-input"
              />
            </div>
            <div className="duty-alert-status">{getDutyAlertStatus(duty)}</div>
            <button
              className="test-notification-btn duty-modal-btn"
              onClick={handleTest}
              disabled={!slackConfigured || testStatus === 'loading'}
              title={slackConfigured ? '오늘/내일 당직자로 슬랙에 즉시 발송' : '슬랙 탭에서 당직 알림용 webhook을 먼저 설정하세요'}
            >
              {testStatus === 'loading' && '전송 중...'}
              {testStatus === 'success' && '전송 성공!'}
              {testStatus === 'fail' && '전송 실패'}
              {testStatus === 'idle' && '지금 테스트 발송'}
            </button>

            <div className="duty-file-sync">
              <div className="duty-file-sync-title">파일에서 가져오기</div>
              <div className="duty-file-row">
                <label>사람 파일</label>
                <input
                  type="text"
                  placeholder="/.../people.json"
                  value={peoplePath}
                  onChange={(e) => setPeoplePath(e.target.value)}
                />
                <button onClick={() => pickFile('people')} className="duty-file-pick">찾기</button>
              </div>
              <div className="duty-file-row">
                <label>월별 배정</label>
                <input
                  type="text"
                  placeholder="/.../assignments/2026-05.json"
                  value={assignmentsPath}
                  onChange={(e) => setAssignmentsPath(e.target.value)}
                />
                <button onClick={() => pickFile('assignments')} className="duty-file-pick">찾기</button>
              </div>
              <button
                className="duty-modal-btn duty-apply-btn"
                onClick={handleApply}
                disabled={applyStatus.kind === 'loading' || !peoplePath.trim() || !assignmentsPath.trim()}
              >
                {applyStatus.kind === 'loading' ? '적용 중...' : '적용하기'}
              </button>
              {applyStatus.msg && (
                <div className={`duty-apply-status ${applyStatus.kind}`}>{applyStatus.msg}</div>
              )}
            </div>
            <button
              className="duty-clear-all-btn duty-modal-btn"
              onClick={() => setConfirmClearAll(true)}
              disabled={duty.people.length === 0 && duty.assignments.length === 0}
            >
              당직자/배정 전체 삭제
            </button>
            <button className="picker-close-btn duty-modal-btn" onClick={() => setShowSettings(false)}>닫기</button>
          </div>
        </>
      )}
    </div>
  )
}
