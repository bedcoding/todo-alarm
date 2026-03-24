import { useState, useEffect, useRef } from 'react'
import type { AwayCheckSettings } from '../../types'

interface AwayCheckTabProps {
  awayCheck: AwayCheckSettings
  onSave: (awayCheck: AwayCheckSettings) => void
}

export default function AwayCheckTab({ awayCheck, onSave }: AwayCheckTabProps) {
  const [local, setLocal] = useState<AwayCheckSettings>(awayCheck)
  const [idleSeconds, setIdleSeconds] = useState(0)
  const [limitSeconds, setLimitSeconds] = useState(awayCheck.limitMinutes * 60)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLocal(awayCheck)
    setLimitSeconds(awayCheck.limitMinutes * 60)
  }, [awayCheck])

  useEffect(() => {
    window.api.onIdleStatus((data) => {
      setIdleSeconds(data.idleSeconds)
      setLimitSeconds(data.limitSeconds)
    })

    // 활성화 상태면 폴링으로도 idle time 가져오기
    if (local.enabled) {
      intervalRef.current = setInterval(async () => {
        const idle = await window.api.getIdleTime()
        setIdleSeconds(idle)
      }, 1000)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [local.enabled])

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
          <div className="away-check-time-buttons">
            {[5, 10, 15, 20].map((m) => (
              <button
                key={m}
                className={`away-time-btn ${local.limitMinutes === m ? 'active' : ''}`}
                onClick={() => update({ limitMinutes: m })}
              >
                {m}분
              </button>
            ))}
          </div>
        </div>

      </div>

      {local.enabled && (
        <div className="away-check-info">
          {isOver
            ? '⚠️ 자리 비운 시간이 초과되었습니다!'
            : isWarning
            ? '⏰ 곧 시간이 초과됩니다!'
            : '키보드/마우스 입력 시 타이머가 초기화됩니다'}
        </div>
      )}
    </div>
  )
}
