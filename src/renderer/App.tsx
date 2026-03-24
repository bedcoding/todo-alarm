import { useState, useEffect } from 'react'
import ScheduleTab from './components/ScheduleTab'
import MemoTab from './components/MemoTab'
import SettingsTab from './components/SettingsTab'
import type { Schedule, Memo, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

const isPopup = window.location.hash === '#popup'

type TabType = 'schedule' | 'memo' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [memos, setMemos] = useState<Memo[]>([])
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })

  useEffect(() => {
    window.api.getSchedules().then(setSchedules)
    window.api.getMemos().then(setMemos)
    window.api.getSettings().then(setSettings)

    window.api.onSchedulesUpdated((updated) => setSchedules(updated))
    window.api.onMemosUpdated((updated) => setMemos(updated))
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

  const handleOpenMain = () => {
    window.api.openMainWindow()
  }

  return (
    <div className={`app ${isPopup ? 'popup-mode' : 'main-mode'}`}>
      {!isPopup && <div className="titlebar-drag" />}
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
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          설정
        </button>
        {isPopup && (
          <button className="tab expand-btn" onClick={handleOpenMain} title="큰 창으로 열기">
            ⛶
          </button>
        )}
      </div>
      <div className="content">
        {activeTab === 'schedule' && (
          <ScheduleTab schedules={schedules} onSave={saveSchedules} isPopup={isPopup} />
        )}
        {activeTab === 'memo' && <MemoTab memos={memos} onSave={saveMemos} />}
        {activeTab === 'settings' && <SettingsTab settings={settings} onSave={saveSettings} />}
      </div>
    </div>
  )
}
