import { useState, useEffect, useRef } from 'react'
import type { RoutineRule, RoutineFreq, HolidayShift, HolidayBasis, HolidayEntry } from '../../types'
import { makeRoutine } from '../../types'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface PreviewItem {
  date: string
  shifted: boolean
  reason?: string
}

interface HolidayState {
  entries: HolidayEntry[]
  fetchedAt?: string
  offline: boolean
}

type RefreshState = 'idle' | 'loading' | 'success' | 'error'

/** 툴팁용 절대 시각 — 상대 표기만으로 부족할 때 hover로 확인 */
function formatFetchedAt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} 갱신`
}

function formatAgo(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff)) return ''
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}일 전`
  // 여기서 멈추면 갱신이 오래 실패했을 때 "400일 전"처럼 자릿수가 늘어나 한 줄이 깨진다.
  // 해가 바뀌는 경계는 30일×12=360일이 아니라 365일로 직접 판정해야 360~364일이 새지 않는다
  if (day < 365) return `${Math.floor(day / 30)}개월 전`
  return `${Math.floor(day / 365)}년 전`
}

interface RoutineManagerProps {
  routines: RoutineRule[]
  onSave: (routines: RoutineRule[]) => void
  onClose: () => void
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABELS[d.getDay()]})`
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + 'T00:00:00').getDay()
  return day === 0 || day === 6
}

/** 연도별로 묶어 헤더를 달면 행마다 연도를 반복하지 않아도 된다 */
function groupByYear(entries: HolidayEntry[]): [string, HolidayEntry[]][] {
  const map = new Map<string, HolidayEntry[]>()
  for (const e of entries) {
    const year = e.date.slice(0, 4)
    const arr = map.get(year)
    if (arr) arr.push(e)
    else map.set(year, [e])
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

const todayStr = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

/** 규칙을 한 줄 요약 — 목록에서 바로 읽히도록 */
function describeRule(r: RoutineRule): string {
  if (r.freq === 'weekly') {
    const days = [...r.weekdays].sort().map((d) => WEEKDAY_LABELS[d]).join('·')
    return `매주 ${days} ${r.time}`
  }
  const day = r.monthDay === 'last' ? '말일' : `${r.monthDay}일`
  if (r.holidayShift === 'none') return `매월 ${day} ${r.time}`
  const basis = r.holidayBasis === 'weekend' ? '주말' : '주말·공휴일'
  const dir = r.holidayShift === 'next' ? '다음' : '이전'
  return `매월 ${day} ${r.time} · ${basis}이면 ${dir} 영업일`
}

export default function RoutineManager({ routines, onSave, onClose }: RoutineManagerProps) {
  const [draft, setDraft] = useState<RoutineRule | null>(null)
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [holidays, setHolidays] = useState<HolidayState | null>(null)
  const [showHolidayList, setShowHolidayList] = useState(false)
  const [refreshState, setRefreshState] = useState<RefreshState>('idle')
  const [refreshMsg, setRefreshMsg] = useState('')
  const previewSeq = useRef(0)

  useEffect(() => {
    window.api.getHolidays().then(setHolidays)
  }, [])

  // 편집 중인 규칙이 실제로 언제 울리는지 즉시 보여준다 (휴일 시프트 결과 포함)
  useEffect(() => {
    if (!draft) {
      setPreview([])
      return
    }
    const seq = ++previewSeq.current
    const timer = setTimeout(() => {
      window.api.previewRoutine(draft).then((items) => {
        if (seq === previewSeq.current) setPreview(items)
      })
    }, 150)
    return () => clearTimeout(timer)
  }, [draft])

  const startCreate = () => setDraft(makeRoutine())
  const startEdit = (r: RoutineRule) => setDraft({ ...r, weekdays: [...r.weekdays], skippedKeys: [...r.skippedKeys] })

  const commitDraft = () => {
    if (!draft || !draft.content.trim()) return
    if (draft.freq === 'weekly' && draft.weekdays.length === 0) return
    const exists = routines.some((r) => r.id === draft.id)
    onSave(exists ? routines.map((r) => (r.id === draft.id ? draft : r)) : [...routines, draft])
    setDraft(null)
  }

  const removeRule = (id: number) => onSave(routines.filter((r) => r.id !== id))

  const toggleEnabled = (id: number) =>
    onSave(routines.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))

  const toggleWeekday = (d: number) => {
    if (!draft) return
    const has = draft.weekdays.includes(d)
    const next = has ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d]
    setDraft({ ...draft, weekdays: next.sort() })
  }

  const refreshHolidays = async () => {
    if (refreshState === 'loading') return
    setRefreshState('loading')
    setRefreshMsg('')
    const startedAt = Date.now()
    const result = await window.api.refreshHolidays()
    const h = await window.api.getHolidays()
    // 응답이 너무 빠르면 아무 일도 안 일어난 것처럼 보이므로 최소한 눈에 남긴다
    const elapsed = Date.now() - startedAt
    if (elapsed < 450) await new Promise((r) => setTimeout(r, 450 - elapsed))

    setHolidays(h)
    if (result.success) {
      setRefreshState('success')
    } else {
      setRefreshState('error')
      setRefreshMsg(result.error || '갱신에 실패했습니다')
    }
    setTimeout(() => setRefreshState('idle'), 2600)
  }

  const canSave = !!draft?.content.trim() && (draft.freq !== 'weekly' || draft.weekdays.length > 0)

  return (
    <>
      <div className="picker-overlay" onClick={onClose} />
      <div className="settings-modal routine-modal">
        <div className="settings-modal-title">
          <span className="settings-tooltip-wrap">
            <span className="settings-tooltip-icon">?</span>
            <span className="settings-tooltip-text">
              규칙을 만들면 앞으로 약 한 달치 일정이
              <br />
              자동으로 생성되어 일정 목록에 🔁 로 표시됩니다.
              <br />
              날짜가 지나면 매일 자동으로 다음 회차가 채워집니다.
            </span>
          </span>
          반복 일정
        </div>

        {!draft ? (
          <>
            <div className="routine-list">
              {routines.length === 0 ? (
                <div className="routine-empty">
                  매달 월세 이체, 매주 주간보고처럼
                  <br />
                  주기적으로 챙겨야 하는 일을 등록하세요.
                </div>
              ) : (
                routines.map((r) => (
                  <div key={r.id} className={`routine-item ${r.enabled ? '' : 'off'}`}>
                    <button
                      className={`routine-toggle ${r.enabled ? 'on' : ''}`}
                      onClick={() => toggleEnabled(r.id)}
                      title={r.enabled ? '일시 중지' : '다시 켜기'}
                    >
                      {r.enabled ? '🔁' : '⏸'}
                    </button>
                    <div className="routine-body" onClick={() => startEdit(r)}>
                      <div className="routine-content">{r.content}</div>
                      <div className="routine-desc">{describeRule(r)}</div>
                    </div>
                    <button className="edit-btn" onClick={() => startEdit(r)}>
                      ✎
                    </button>
                    <button className="delete-btn" onClick={() => removeRule(r.id)}>
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="routine-holiday-box">
              <div className="routine-holiday-info">
                {holidays?.offline ? (
                  <span className="routine-holiday-warn">
                    ⚠️ 공휴일 정보 없음 — 토·일만 휴일로 계산
                  </span>
                ) : (
                  <button
                    className="routine-holiday-summary"
                    onClick={() => setShowHolidayList((v) => !v)}
                    title="반영된 공휴일 보기"
                  >
                    <span className={`routine-caret ${showHolidayList ? 'open' : ''}`}>▸</span>
                    <span>🇰🇷 공휴일 {holidays?.entries.length ?? 0}일 반영됨</span>
                  </button>
                )}
                <span className="routine-holiday-meta-wrap">
                  {/* 갱신 시각은 갱신 버튼과 한 쌍이므로 버튼 바로 옆에 둔다 */}
                  {/* 갱신 직후엔 같은 자리가 초록으로 바뀌었다가 회색으로 가라앉는다.
                      건수는 왼쪽 "공휴일 N일 반영됨"이 이미 갱신되므로 여기서 반복하지 않는다 */}
                  {refreshState === 'success' ? (
                    <span className="routine-holiday-meta success">방금 전</span>
                  ) : refreshState === 'idle' && holidays?.fetchedAt ? (
                    <span className="routine-holiday-meta" title={formatFetchedAt(holidays.fetchedAt)}>
                      {formatAgo(holidays.fetchedAt)}
                    </span>
                  ) : null}
                  <button
                    className={`routine-refresh-btn ${refreshState}`}
                    onClick={refreshHolidays}
                    disabled={refreshState === 'loading'}
                  >
                    {refreshState === 'loading' ? '갱신 중…'
                      : refreshState === 'success' ? '✓ 완료'
                      : refreshState === 'error' ? '✗ 실패'
                      : '갱신'}
                  </button>
                </span>
              </div>

              {/* 실패만 줄을 하나 더 쓴다 — 원인을 알려면 짧게 못 줄인다 */}
              {refreshState === 'error' && refreshMsg && (
                <div className="routine-refresh-msg error">{refreshMsg}</div>
              )}

              {showHolidayList && !holidays?.offline && (
                <div className="routine-holiday-list">
                  {groupByYear(holidays?.entries ?? []).map(([year, list]) => (
                    <div key={year}>
                      <div className="routine-holiday-year">{year}년</div>
                      {list.map((h) => (
                        <div key={h.date} className={`routine-holiday-row ${h.date < todayStr ? 'past' : ''}`}>
                          <span className="routine-holiday-date">{formatDateLabel(h.date)}</span>
                          <span className="routine-holiday-name">{h.name || '공휴일'}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="routine-hint" style={{ marginTop: 6 }}>
                    토·일은 목록과 별개로 항상 휴일로 계산됩니다
                  </div>
                </div>
              )}
            </div>

            <button className="picker-close-btn routine-add-btn" onClick={startCreate}>
              + 반복 일정 추가
            </button>
            <button className="picker-close-btn" onClick={onClose}>
              닫기
            </button>
          </>
        ) : (
          <>
            <div className="routine-form">
              <input
                type="text"
                className="time-input"
                placeholder="반복 일정 내용 (예: 월세 이체)"
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                autoFocus
              />

              <div className="routine-seg">
                {(['monthly', 'weekly'] as RoutineFreq[]).map((f) => (
                  <button
                    key={f}
                    className={`routine-seg-btn ${draft.freq === f ? 'active' : ''}`}
                    onClick={() => setDraft({ ...draft, freq: f })}
                  >
                    {f === 'monthly' ? '날짜 고정 (매월)' : '요일 고정 (매주)'}
                  </button>
                ))}
              </div>

              {draft.freq === 'monthly' ? (
                <>
                  <div className="settings-row">
                    <label>날짜</label>
                    <select
                      value={String(draft.monthDay)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          monthDay: e.target.value === 'last' ? 'last' : Number(e.target.value)
                        })
                      }
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          매월 {d}일
                        </option>
                      ))}
                      <option value="last">매월 말일</option>
                    </select>
                  </div>
                  {typeof draft.monthDay === 'number' && draft.monthDay > 28 && (
                    <div className="routine-hint">
                      해당 날짜가 없는 달은 말일로 자동 조정됩니다
                    </div>
                  )}
                  <div className="settings-row">
                    <label className="label-with-tooltip">
                      휴일에 걸리면
                      <span className="inline-tooltip-wrap">
                        <span className="inline-tooltip-icon">?</span>
                        <span className="inline-tooltip-text">
                          월세처럼 날짜가 절대적이면 &apos;그대로&apos;,
                          <br />
                          법인카드 정산처럼 업무일 기준이면
                          <br />
                          &apos;다음 영업일로&apos;를 고르세요.
                        </span>
                      </span>
                    </label>
                    <select
                      value={draft.holidayShift}
                      onChange={(e) =>
                        setDraft({ ...draft, holidayShift: e.target.value as HolidayShift })
                      }
                    >
                      <option value="none">그대로 알림</option>
                      <option value="next">다음 영업일로</option>
                      <option value="prev">이전 영업일로</option>
                    </select>
                  </div>
                  {draft.holidayShift !== 'none' && (
                    <div className="settings-row">
                      <label className="label-with-tooltip">
                        휴일 기준
                        <span className="inline-tooltip-wrap">
                          <span className="inline-tooltip-icon">?</span>
                          <span className="inline-tooltip-text">
                            평일 공휴일에도 근무하는 업종이면
                            <br />
                            &apos;토·일만&apos;을 고르세요.
                          </span>
                        </span>
                      </label>
                      <select
                        value={draft.holidayBasis}
                        onChange={(e) =>
                          setDraft({ ...draft, holidayBasis: e.target.value as HolidayBasis })
                        }
                      >
                        <option value="publicHoliday">토·일 + 법정공휴일</option>
                        <option value="weekend">토·일만</option>
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="routine-weekdays">
                    {WEEKDAY_LABELS.map((label, d) => (
                      <button
                        key={d}
                        className={`routine-day-btn ${draft.weekdays.includes(d) ? 'active' : ''} ${d === 0 ? 'sun' : d === 6 ? 'sat' : ''}`}
                        onClick={() => toggleWeekday(d)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="routine-hint">
                    요일 고정은 공휴일에도 그대로 알립니다
                  </div>
                </>
              )}

              <div className="settings-row">
                <label>알림 시각</label>
                <input
                  type="time"
                  className="time-input"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                />
              </div>

              <div className="routine-preview">
                <div className="routine-preview-title">다음 알림</div>
                {preview.length === 0 ? (
                  <div className="routine-preview-empty">계산 중…</div>
                ) : (
                  <div className="routine-preview-items">
                    {preview.map((p) => (
                      <span key={p.date} className="routine-preview-chip">
                        {p.shifted && p.reason && (
                          <>
                            <span
                              className="routine-preview-from"
                              title={`${formatDateLabel(p.reason)}은 ${isWeekend(p.reason) ? '주말' : '공휴일'}`}
                            >
                              {formatDateLabel(p.reason)}
                            </span>
                            <span className="routine-preview-arrow">→</span>
                          </>
                        )}
                        <span className={p.shifted ? 'shifted' : ''}>{formatDateLabel(p.date)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              className="picker-close-btn routine-save-btn"
              onClick={commitDraft}
              disabled={!canSave}
            >
              저장
            </button>
            <button className="picker-close-btn" onClick={() => setDraft(null)}>
              취소
            </button>
          </>
        )}
      </div>
    </>
  )
}
