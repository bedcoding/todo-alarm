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

  useEffect(() => {
    setLocal(awayCheck)
    setLimitSeconds(awayCheck.limitMinutes * 60)
  }, [awayCheck])

  useEffect(() => {
    window.api.onIdleStatus((data) => {
      setIdleSeconds(data.idleSeconds)
      setLimitSeconds(data.limitSeconds)
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
      <div className="away-check-timer-section">
        <div className={`away-check-circle ${isWarning ? 'warning' : ''} ${isOver ? 'over' : ''}`}>
          <svg viewBox="0 0 120 120" className="away-check-svg">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#333" strokeWidth="8" />
            {local.enabled && (
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
          <label>제한 시간</label>
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
        <div className="away-check-limit-desc">
          {local.limitMinutes}분 초과 시 자리비움 경고 알림이 발송됩니다
        </div>

      </div>

      {local.enabled && (
        <div className="away-check-info">
          {isOver
            ? '⚠️ 자리 비운 시간이 초과되었습니다!'
            : isWarning
            ? '⏰ 곧 시간이 초과됩니다!'
            : '키보드/마우스 입력 시 타이머가 초기화됩니다'}
          <div className="away-check-hint">
            * 주의: 어떤 이석체크 프로그램은 키보드만 감지함 (타이핑 권장)
          </div>
        </div>
      )}
    </div>
  )
}
