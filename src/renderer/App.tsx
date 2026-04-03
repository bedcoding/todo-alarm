import { useState, useEffect } from 'react'
import ScheduleTab from './components/ScheduleTab'
import MemoTab from './components/MemoTab'
import AwayCheckTab from './components/AwayCheckTab'
import SettingsTab from './components/SettingsTab'
import type { Schedule, Memo, Settings, AwayCheckSettings } from '../types'
import { DEFAULT_SETTINGS, DEFAULT_AWAY_CHECK } from '../types'

const isPopup = window.location.hash === '#popup'

type TabType = 'schedule' | 'memo' | 'awaycheck' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [memos, setMemos] = useState<Memo[]>([])
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })
  const [awayCheck, setAwayCheck] = useState<AwayCheckSettings>({ ...DEFAULT_AWAY_CHECK })
  const [idleSeconds, setIdleSeconds] = useState(0)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    window.api.getSchedules().then(setSchedules)
    window.api.getMemos().then(setMemos)
    window.api.getSettings().then(setSettings)
    window.api.getAwayCheck().then(setAwayCheck)

    window.api.onSchedulesUpdated((updated) => setSchedules(updated))
    window.api.onMemosUpdated((updated) => setMemos(updated))
    window.api.onAwayCheckUpdated((updated) => setAwayCheck(updated))
    window.api.onIdleStatus((data) => setIdleSeconds(data.idleSeconds))
  }, [])

  const saveSchedules = async (newSchedules: Schedule[]) => {
    setSchedules(newSchedules)
    await window.api.saveSchedules(newSchedules)
  }

  const saveMemos = async (newMemos: Memo[]) => {
    setMemos(newMemos)
    await window.api.saveMemos(newMemos)
  }

  const saveSettings = async (newSettings: Settings) => {
    setSettings(newSettings)
    await window.api.saveSettings(newSettings)
  }

  const saveAwayCheck = async (newAwayCheck: AwayCheckSettings) => {
    setAwayCheck(newAwayCheck)
    await window.api.saveAwayCheck(newAwayCheck)
  }

  const handleOpenMain = () => {
    window.api.openMainWindow()
  }

  const awayRemaining = Math.max(0, awayCheck.limitMinutes * 60 - idleSeconds)
  const awayMinutes = Math.floor(awayRemaining / 60)
  const awaySeconds = awayRemaining % 60
  const awayProgress = awayCheck.enabled ? Math.min(1, idleSeconds / (awayCheck.limitMinutes * 60)) : 0
  const awayWarning = awayCheck.enabled && awayRemaining <= 60 && awayRemaining > 0
  const awayOver = awayCheck.enabled && awayRemaining === 0 && idleSeconds > 0

  return (
    <div className={`app ${isPopup ? 'popup-mode' : 'main-mode'}`}>
      {!isPopup && <div className="titlebar-drag" />}
      {awayCheck.enabled && (
        <div
          className={`away-global-bar ${awayWarning ? 'warning' : ''} ${awayOver ? 'over' : ''}`}
          onClick={() => setActiveTab('awaycheck')}
        >
          <div className="away-global-progress" style={{ width: `${awayProgress * 100}%` }} />
          <div className="away-global-text">
            {awayOver
              ? '⚠️ 이석 시간 초과!'
              : `🔔 ${String(awayMinutes).padStart(2, '0')}:${String(awaySeconds).padStart(2, '0')} 남음`}
          </div>
        </div>
      )}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          일정
        </button>
        <button
          className={`tab ${activeTab === 'memo' ? 'active' : ''}`}
          onClick={() => setActiveTab('memo')}
        >
          메모
        </button>
        <button
          className={`tab ${activeTab === 'awaycheck' ? 'active' : ''}`}
          onClick={() => setActiveTab('awaycheck')}
        >
          이석
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          설정
        </button>
        {isPopup && (
          <>
            <button
              className={`tab pin-btn ${pinned ? 'pinned' : ''}`}
              onClick={() => {
                const next = !pinned
                setPinned(next)
                window.api.setPinned(next)
              }}
              title={pinned ? '고정 해제' : '창 고정'}
            >
              📌
            </button>
            <button className="tab expand-btn" onClick={handleOpenMain} title="큰 창으로 열기">
              ⛶
            </button>
          </>
        )}
      </div>
      <div className="content">
        <div className={`tab-panel ${activeTab === 'schedule' ? 'active' : ''}`}>
          <ScheduleTab schedules={schedules} onSave={saveSchedules} settings={settings} onSettingsChange={(patch) => saveSettings({ ...settings, ...patch })} isPopup={isPopup} />
        </div>
        <div className={`tab-panel ${activeTab === 'memo' ? 'active' : ''}`}>
          <MemoTab memos={memos} onSave={saveMemos} />
        </div>
        <div className={`tab-panel ${activeTab === 'awaycheck' ? 'active' : ''}`}>
          <AwayCheckTab awayCheck={awayCheck} onSave={saveAwayCheck} />
        </div>
        <div className={`tab-panel ${activeTab === 'settings' ? 'active' : ''}`}>
          <SettingsTab settings={settings} onSave={saveSettings} />
        </div>
      </div>
    </div>
  )
}
