import { useState, useRef, useCallback } from 'react'
import type { Settings } from '../../types'

interface SettingsTabProps {
  settings: Settings
  onSave: (settings: Settings) => void
}

type SubTab = 'notification' | 'slack'

export default function SettingsTab({ settings, onSave }: SettingsTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('notification')
  const [notifTestStatus, setNotifTestStatus] = useState<'idle' | 'success' | 'denied'>('idle')
  const [slackTestStatus, setSlackTestStatus] = useState<'idle' | 'loading' | 'success' | 'fail'>('idle')
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [textEdits, setTextEdits] = useState<Partial<Settings>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const update = (patch: Partial<Settings>) => {
    onSave({ ...settings, ...patch })
  }

  const updateText = useCallback((patch: Partial<Settings>) => {
    setTextEdits((prev) => ({ ...prev, ...patch }))
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSave({ ...settings, ...textEdits, ...patch })
      setTextEdits({})
    }, 500)
  }, [settings, textEdits, onSave])

  const mergedSettings = { ...settings, ...textEdits }

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
    const { slackMethod, slackWebhookUrl, slackBotToken, slackChannelId } = settings
    if (slackMethod === 'webhook' && !slackWebhookUrl.trim()) return
    if (slackMethod === 'bot' && (!slackBotToken.trim() || !slackChannelId.trim())) return
    setSlackTestStatus('loading')
    const result = await window.api.testSlack({
      method: slackMethod,
      webhookUrl: slackWebhookUrl,
      botToken: slackBotToken,
      channelId: slackChannelId
    })
    setSlackTestStatus(result.success ? 'success' : 'fail')
    setTimeout(() => setSlackTestStatus('idle'), 3000)
  }

  return (
    <div className="settings-tab">
      <div className="sub-tabs">
        <button
          className={`sub-tab ${subTab === 'notification' ? 'active' : ''}`}
          onClick={() => setSubTab('notification')}
        >
          알림
        </button>
        <button
          className={`sub-tab ${subTab === 'slack' ? 'active' : ''}`}
          onClick={() => setSubTab('slack')}
        >
          슬랙
        </button>
      </div>

      {subTab === 'notification' && (
        <div className="settings-section">
          <div className="settings-row">
            <label>체크 주기</label>
            <select
              value={settings.checkInterval}
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
              value={settings.alertTiming}
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
              className={`toggle ${settings.macNotification ? 'on' : ''}`}
              onClick={() => update({ macNotification: !settings.macNotification })}
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
      )}

      {subTab === 'slack' && (
        <div className="settings-section">
          <div className="settings-row">
            <label>Slack 알림</label>
            <div
              className={`toggle ${settings.slackEnabled ? 'on' : ''}`}
              onClick={() => update({ slackEnabled: !settings.slackEnabled })}
            >
              <div className="toggle-knob" />
            </div>
          </div>

          {settings.slackEnabled && (
            <>
              <div className="settings-row">
                <label>연동 방식</label>
                <select
                  value={settings.slackMethod}
                  onChange={(e) => update({ slackMethod: e.target.value as 'webhook' | 'bot' })}
                >
                  <option value="webhook">Webhook URL</option>
                  <option value="bot">Bot Token</option>
                </select>
              </div>

              {settings.slackMethod === 'webhook' ? (
                <div className="settings-row vertical">
                  <label>Webhook URL</label>
                  <input
                    type="text"
                    placeholder="https://hooks.slack.com/services/T.../B.../xxx"
                    value={mergedSettings.slackWebhookUrl}
                    onChange={(e) => updateText({ slackWebhookUrl: e.target.value })}
                    className="webhook-input"
                  />
                </div>
              ) : (
                <>
                  <div className="settings-row vertical">
                    <label>Bot Token</label>
                    <input
                      type="text"
                      placeholder="xoxb-..."
                      value={mergedSettings.slackBotToken}
                      onChange={(e) => updateText({ slackBotToken: e.target.value })}
                      className="webhook-input"
                    />
                  </div>
                  <div className="settings-row vertical">
                    <label>채널 ID</label>
                    <input
                      type="text"
                      placeholder="C01XXXXXXXX"
                      value={mergedSettings.slackChannelId}
                      onChange={(e) => updateText({ slackChannelId: e.target.value })}
                      className="webhook-input"
                    />
                  </div>
                </>
              )}

              <div className="settings-row">
                <button
                  className="test-slack-btn"
                  onClick={handleTestSlack}
                  disabled={slackTestStatus === 'loading' || (
                    settings.slackMethod === 'webhook'
                      ? !settings.slackWebhookUrl.trim()
                      : !settings.slackBotToken.trim() || !settings.slackChannelId.trim()
                  )}
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
      )}

      {snackbar && (
        <div className="snackbar">{snackbar}</div>
      )}
    </div>
  )
}
