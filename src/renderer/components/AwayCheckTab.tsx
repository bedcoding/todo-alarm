import { useState, useEffect } from 'react'
import type { AwayCheckSettings } from '../../types'

interface AwayCheckTabProps {
  awayCheck: AwayCheckSettings
  onSave: (awayCheck: AwayCheckSettings) => void
}

export default function AwayCheckTab({ awayCheck, onSave }: AwayCheckTabProps) {
  const [local, setLocal] = useState<AwayCheckSettings>(awayCheck)
  const [idleSeconds, setIdleSeconds] = useState(0)
  const [limitSeconds, setLimitSeconds] = useState(awayCheck.limitMinutes * 60)
  const [showSettings, setShowSettings] = useState(false)
  const [notifTest, setNotifTest] = useState<'idle' | 'success' | 'denied'>('idle')
  const [excluded, setExcluded] = useState(false)

  useEffect(() => {
    setLocal(awayCheck)
    setLimitSeconds(awayCheck.limitMinutes * 60)
  }, [awayCheck])

  useEffect(() => {
    window.api.onIdleStatus((data) => {
      setIdleSeconds(data.idleSeconds)
      setLimitSeconds(data.limitSeconds)
      setExcluded(data.excluded ?? false)
    })
  }, [])

  const update = (patch: Partial<AwayCheckSettings>) => {
    const updated = { ...local, ...patch }
    setLocal(updated)
    onSave(updated)
  }

  const remaining = Math.max(0, limitSeconds - idleSeconds)
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const progress = local.enabled ? Math.min(1, idleSeconds / limitSeconds) : 0
  const isWarning = local.enabled && remaining <= 60 && remaining > 0
  const isOver = local.enabled && remaining === 0 && idleSeconds > 0

  return (
    <div className="away-check-tab">
      <div className="away-check-help">
        <span className="help-icon">?</span>
        <div className="help-tooltip">
          키보드나 마우스의 동작이 감지되면 타이머가 초기화됩니다.<br />
        </div>
      </div>
      <div className="away-check-timer-section">
        <div className={`away-check-circle ${isWarning ? 'warning' : ''} ${isOver ? 'over' : ''} ${excluded ? 'excluded' : ''}`}>
          <svg viewBox="0 0 120 120" className="away-check-svg">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#333" strokeWidth="8" />
            {local.enabled && !excluded && (
              <circle
                cx="60" cy="60" r="52"
                fill="none"
                stroke={isOver ? '#e94560' : isWarning ? '#ff9800' : '#4caf50'}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress)}`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
              />
            )}
          </svg>
          <div className="away-check-time">
            {!local.enabled ? (
              <span className="away-check-off">OFF</span>
            ) : excluded ? (
              <span className="away-check-excluded">일시중지</span>
            ) : isOver ? (
              <span className="away-check-exceeded">초과!</span>
            ) : (
              <>
                <span className={`away-check-digits ${isWarning ? 'warning' : ''}`}>
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </span>
                <span className="away-check-label">남음</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="away-check-controls">
        <div className="settings-row">
          <label>이석체크</label>
          <div
            className={`toggle ${local.enabled ? 'on' : ''}`}
            onClick={() => update({ enabled: !local.enabled })}
          >
            <div className="toggle-knob" />
          </div>
        </div>

        <div className="settings-row">
          <label>제한시간</label>
          <div className="away-check-limit-input">
            <button
              className="limit-btn"
              onClick={() => update({ limitMinutes: Math.max(1, Math.floor((local.limitMinutes - 1) / 5) * 5) })}
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              className="limit-value-input"
              value={local.limitMinutes}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, ''))
                if (v >= 0) update({ limitMinutes: Math.max(1, Math.min(120, v || 1)) })
              }}
            />
            <span className="limit-unit">분</span>
            <button
              className="limit-btn"
              onClick={() => update({ limitMinutes: Math.min(120, Math.ceil((local.limitMinutes + 1) / 5) * 5) })}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <button className="inline-settings-toggle" onClick={() => setShowSettings(true)}>
        알림 설정
      </button>

      {showSettings && (
        <>
          <div className="picker-overlay" onClick={() => setShowSettings(false)} />
          <div className="settings-modal">
            <div className="settings-modal-title">알림 설정</div>
            <div className="settings-row compact">
              <label>요일 제외</label>
            </div>
            <div className="day-selector">
              {['일', '월', '화', '수', '목', '금', '토'].map((label, i) => (
                <button
                  key={i}
                  className={`day-btn ${local.excludeDays.includes(i) ? 'active' : ''}`}
                  onClick={() => {
                    const days = local.excludeDays.includes(i)
                      ? local.excludeDays.filter((d) => d !== i)
                      : [...local.excludeDays, i]
                    update({ excludeDays: days })
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="settings-row compact">
              <label>출근 전 제외</label>
              <div
                className={`toggle ${local.excludeBeforeWork ? 'on' : ''}`}
                onClick={() => update({ excludeBeforeWork: !local.excludeBeforeWork })}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            {local.excludeBeforeWork && (
              <div className="time-range no-border">
                <input type="time" value={local.beforeWorkTime} onChange={(e) => update({ beforeWorkTime: e.target.value })} className="time-input" />
                <span>이전</span>
              </div>
            )}
            <div className="settings-row compact">
              <label>점심시간 제외</label>
              <div
                className={`toggle ${local.excludeLunch ? 'on' : ''}`}
                onClick={() => update({ excludeLunch: !local.excludeLunch })}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            {local.excludeLunch && (
              <div className="time-range no-border">
                <input type="time" value={local.lunchStart} onChange={(e) => update({ lunchStart: e.target.value })} className="time-input" />
                <span>~</span>
                <input type="time" value={local.lunchEnd} onChange={(e) => update({ lunchEnd: e.target.value })} className="time-input" />
              </div>
            )}
            <div className="settings-row compact">
              <label>퇴근 후 제외</label>
              <div
                className={`toggle ${local.excludeAfterWork ? 'on' : ''}`}
                onClick={() => update({ excludeAfterWork: !local.excludeAfterWork })}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            {local.excludeAfterWork && (
              <div className="time-range no-border">
                <input type="time" value={local.afterWorkTime} onChange={(e) => update({ afterWorkTime: e.target.value })} className="time-input" />
                <span>이후</span>
              </div>
            )}
            <div className="settings-row">
              <button className="test-notification-btn" onClick={async () => {
                const result = await window.api.testAwayNotification()
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
