import { useState, useEffect, useRef } from 'react'
import ScheduleTab from './components/ScheduleTab'
import MemoTab from './components/MemoTab'
import AwayCheckTab from './components/AwayCheckTab'
import SettingsTab from './components/SettingsTab'
import TrashTab from './components/TrashTab'
import type { Schedule, Memo, Settings, AwayCheckSettings, TrashItem } from '../types'
import { DEFAULT_SETTINGS, DEFAULT_AWAY_CHECK } from '../types'

const isPopup = window.location.hash === '#popup'

type TabType = 'schedule' | 'memo' | 'awaycheck' | 'settings' | 'trash'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [memos, setMemos] = useState<Memo[]>([])
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })
  const [awayCheck, setAwayCheck] = useState<AwayCheckSettings>({ ...DEFAULT_AWAY_CHECK })
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [idleSeconds, setIdleSeconds] = useState(0)
  const [pinned, setPinned] = useState(false)
  const [toast, setToast] = useState<{ message: string; onUndo: () => void } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api.getSchedules().then(setSchedules)
    window.api.getMemos().then(setMemos)
    window.api.getSettings().then(setSettings)
    window.api.getAwayCheck().then(setAwayCheck)
    window.api.getTrash().then(setTrash)

    window.api.onSchedulesUpdated((updated) => setSchedules(updated))
    window.api.onMemosUpdated((updated) => setMemos(updated))
    window.api.onAwayCheckUpdated((updated) => setAwayCheck(updated))
    window.api.onIdleStatus((data) => setIdleSeconds(data.idleSeconds))
    window.api.onTrashUpdated((updated) => setTrash(updated))
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

  const saveTrash = async (newTrash: TrashItem[]) => {
    setTrash(newTrash)
    await window.api.saveTrash(newTrash)
  }

  const showUndoToast = (message: string, onUndo: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, onUndo })
    toastTimerRef.current = setTimeout(() => setToast(null), 5000)
  }

  const deleteSchedule = async (id: number) => {
    const target = schedules.find((s) => s.id === id)
    if (!target) return
    const newSchedules = schedules.filter((s) => s.id !== id)
    const trashItem: TrashItem = { id: Date.now(), type: 'schedule', data: target, deletedAt: new Date().toISOString() }
    const newTrash = [...trash, trashItem]
    await saveSchedules(newSchedules)
    await saveTrash(newTrash)
    showUndoToast('일정이 삭제되었습니다', async () => {
      await saveSchedules([...newSchedules, target])
      await saveTrash(newTrash.filter((t) => t.id !== trashItem.id))
    })
  }

  const deleteMemo = async (id: number) => {
    const target = memos.find((m) => m.id === id)
    if (!target) return
    const newMemos = memos.filter((m) => m.id !== id)
    const trashItem: TrashItem = { id: Date.now(), type: 'memo', data: target, deletedAt: new Date().toISOString() }
    const newTrash = [...trash, trashItem]
    await saveMemos(newMemos)
    await saveTrash(newTrash)
    showUndoToast('메모가 삭제되었습니다', async () => {
      await saveMemos([...newMemos, target])
      await saveTrash(newTrash.filter((t) => t.id !== trashItem.id))
    })
  }

  const restoreFromTrash = async (item: TrashItem) => {
    if (item.type === 'schedule') {
      await saveSchedules([...schedules, item.data as Schedule])
    } else {
      await saveMemos([item.data as Memo, ...memos])
    }
    await saveTrash(trash.filter((t) => t.id !== item.id))
  }

  const permanentDelete = async (trashItemId: number) => {
    await saveTrash(trash.filter((t) => t.id !== trashItemId))
  }

  const emptyTrash = async () => {
    await saveTrash([])
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
          슬랙
        </button>
        <button
          className={`tab trash-btn ${activeTab === 'trash' ? 'active' : ''}`}
          onClick={() => setActiveTab(activeTab === 'trash' ? 'schedule' : 'trash')}
          title="휴지통"
        >
          🗑️{trash.length > 0 && <span className="trash-badge">{trash.length}</span>}
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
          <ScheduleTab schedules={schedules} onSave={saveSchedules} onDelete={deleteSchedule} settings={settings} onSettingsChange={(patch) => saveSettings({ ...settings, ...patch })} isPopup={isPopup} />
        </div>
        <div className={`tab-panel ${activeTab === 'memo' ? 'active' : ''}`}>
          <MemoTab memos={memos} onSave={saveMemos} onDelete={deleteMemo} />
        </div>
        <div className={`tab-panel ${activeTab === 'awaycheck' ? 'active' : ''}`}>
          <AwayCheckTab awayCheck={awayCheck} onSave={saveAwayCheck} />
        </div>
        <div className={`tab-panel ${activeTab === 'settings' ? 'active' : ''}`}>
          <SettingsTab settings={settings} onSave={saveSettings} />
        </div>
        <div className={`tab-panel ${activeTab === 'trash' ? 'active' : ''}`}>
          <TrashTab trash={trash} onRestore={restoreFromTrash} onPermanentDelete={permanentDelete} onEmptyAll={emptyTrash} />
        </div>
      </div>
      {toast && (
        <div className="undo-toast">
          <span>{toast.message}</span>
          <button onClick={() => { toast.onUndo(); setToast(null); if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }}>되돌리기</button>
        </div>
      )}
    </div>
  )
}
