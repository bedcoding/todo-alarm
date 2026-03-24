import { useState } from 'react'
import EmptyBell from './EmptyBell'
import type { Memo } from '../../types'

interface MemoTabProps {
  memos: Memo[]
  onSave: (memos: Memo[]) => void
}

export default function MemoTab({ memos, onSave }: MemoTabProps) {
  const [content, setContent] = useState('')

  const addMemo = () => {
    if (!content.trim()) return
    const newMemo: Memo = {
      id: Date.now(),
      content: content.trim(),
      createdAt: new Date().toISOString()
    }
    onSave([newMemo, ...memos])
    setContent('')
  }

  const removeMemo = (id: number) => {
    onSave(memos.filter((m) => m.id !== id))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      addMemo()
    }
  }

  const formatDate = (isoStr: string): string => {
    const d = new Date(isoStr)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const h = d.getHours()
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${month}/${day} ${h}:${m}`
  }

  return (
    <div className="memo-tab">
      <div className="memo-input-area">
        <textarea
          placeholder="아이디어나 메모를 입력하세요"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
        <button className="add-btn" onClick={addMemo}>
          추가
        </button>
      </div>
      <div className="memo-list">
        {memos.length === 0 ? (
          <EmptyBell message="메모를 추가해보세요" />
        ) : (
          memos.map((m) => (
            <div key={m.id} className="memo-item">
              <div className="memo-content">{m.content}</div>
              <div className="memo-footer">
                <span className="memo-date">{formatDate(m.createdAt)}</span>
                <button className="delete-btn" onClick={() => removeMemo(m.id)}>
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
