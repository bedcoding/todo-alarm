import { useState, useEffect } from 'react'
import type { Settings } from '../../types'

interface SettingsTabProps {
  settings: Settings
  onSave: (settings: Settings) => void
}

export default function SettingsTab({ settings, onSave }: SettingsTabProps) {
  const [localSettings, setLocalSettings] = useState<Settings>(settings)
  const [slackTestStatus, setSlackTestStatus] = useState<'idle' | 'loading' | 'success' | 'fail'>('idle')
  const [notifTestStatus, setNotifTestStatus] = useState<'idle' | 'success' | 'denied'>('idle')
  const [saved, setSaved] = useState(false)

  const update = (patch: Partial<Settings>) => {
    setLocalSettings((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const handleSave = () => {
    onSave(localSettings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const [snackbar, setSnackbar] = useState<string | null>(null)

  const handleTestNotification = async () => {
    const result = await window.api.testNotification()
    if (result.success) {
      setNotifTestStatus('success')
      setSnackbar('알림이 안 보이면: 시스템 설정 → 알림에서 허용해주세요')
    } else {
      setNotifTestStatus('denied')
    }
    setTimeout(() => setNotifTestStatus('idle'), 3000)
    setTimeout(() => setSnackbar(null), 4000)
  }

  const handleTestSlack = async () => {
    if (!localSettings.slackWebhookUrl.trim()) return
    setSlackTestStatus('loading')
    const result = await window.api.testSlack(localSettings.slackWebhookUrl)
    setSlackTestStatus(result.success ? 'success' : 'fail')
    setTimeout(() => setSlackTestStatus('idle'), 3000)
  }

  return (
    <div className="settings-tab">
      <div className="settings-section">
        <h3 className="settings-section-title">알림 설정</h3>

        <div className="settings-row">
          <label>체크 주기</label>
          <select
            value={localSettings.checkInterval}
            onChange={(e) => update({ checkInterval: Number(e.target.value) })}
          >
            <option value={30000}>30초</option>
            <option value={60000}>1분</option>
            <option value={300000}>5분</option>
          </select>
        </div>

        <div className="settings-row">
          <label>알림 타이밍</label>
          <select
            value={localSettings.alertTiming}
            onChange={(e) => update({ alertTiming: Number(e.target.value) })}
          >
            <option value={0}>정시</option>
            <option value={5}>5분 전</option>
            <option value={10}>10분 전</option>
            <option value={30}>30분 전</option>
          </select>
        </div>

        <div className="settings-row">
          <label>macOS 알림</label>
          <div
            className={`toggle ${localSettings.macNotification ? 'on' : ''}`}
            onClick={() => update({ macNotification: !localSettings.macNotification })}
          >
            <div className="toggle-knob" />
          </div>
        </div>

        <div className="settings-row">
          <button className="test-notification-btn" onClick={handleTestNotification}>
            {notifTestStatus === 'success' && '알림 전송됨!'}
            {notifTestStatus === 'denied' && '알림이 차단되어 있습니다'}
            {notifTestStatus === 'idle' && '알림 테스트'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Slack 연동</h3>

        <div className="settings-row">
          <label>Slack 알림</label>
          <div
            className={`toggle ${localSettings.slackEnabled ? 'on' : ''}`}
            onClick={() => update({ slackEnabled: !localSettings.slackEnabled })}
          >
            <div className="toggle-knob" />
          </div>
        </div>

        {localSettings.slackEnabled && (
          <>
            <div className="settings-row vertical">
              <label>Webhook URL</label>
              <input
                type="text"
                placeholder="https://hooks.slack.com/services/T.../B.../xxx"
                value={localSettings.slackWebhookUrl}
                onChange={(e) => update({ slackWebhookUrl: e.target.value })}
                className="webhook-input"
              />
            </div>
            <div className="settings-row">
              <button
                className="test-slack-btn"
                onClick={handleTestSlack}
                disabled={slackTestStatus === 'loading' || !localSettings.slackWebhookUrl.trim()}
              >
                {slackTestStatus === 'loading' && '전송 중...'}
                {slackTestStatus === 'success' && '전송 성공!'}
                {slackTestStatus === 'fail' && '전송 실패'}
                {slackTestStatus === 'idle' && 'Slack 테스트'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="settings-footer">
        <button className="save-settings-btn" onClick={handleSave}>
          {saved ? '저장 완료!' : '설정 저장'}
        </button>
      </div>

      {snackbar && (
        <div className="snackbar">{snackbar}</div>
      )}
    </div>
  )
}
