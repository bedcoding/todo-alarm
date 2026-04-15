import { useState } from 'react'
import EmptyBell from './EmptyBell'
import type { Memo } from '../../types'

interface MemoTabProps {
  memos: Memo[]
  onSave: (memos: Memo[]) => void
}

export default function MemoTab({ memos, onSave }: MemoTabProps) {
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')

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

  const startEdit = (m: Memo) => {
    setEditingId(m.id)
    setEditContent(m.content)
  }

  const saveEdit = () => {
    if (editingId === null) return
    if (!editContent.trim()) return
    onSave(memos.map((m) => m.id === editingId ? { ...m, content: editContent.trim() } : m))
    setEditingId(null)
    setEditContent('')
  }

  const moveMemo = (id: number, direction: -1 | 1) => {
    const idx = memos.findIndex((m) => m.id === id)
    if (idx < 0) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= memos.length) return
    const updated = [...memos]
    ;[updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    onSave(updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      addMemo()
    }
  }

  return (
    <div className="memo-tab">
      <div className="memo-input-area">
        <input
          type="text"
          placeholder="메모를 입력하세요"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="add-btn" onClick={addMemo}>
          추가
        </button>
      </div>
      <div className="memo-list">
        {memos.length === 0 ? (
          <EmptyBell message="메모를 추가해보세요" />
        ) : (
          memos.map((m, i) => (
            <div key={m.id} className="memo-item slim">
              {editingId === m.id ? (
                <input
                  type="text"
                  className="memo-edit-input"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveEdit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={saveEdit}
                  autoFocus
                />
              ) : (
                <span className="memo-content-wrap" onClick={() => startEdit(m)}>
                  <span className="memo-content-inline">{m.content}</span>
                  <span className="memo-content-tooltip">{m.content}</span>
                </span>
              )}
              <div className="memo-actions">
                <button className="move-btn" onClick={() => moveMemo(m.id, -1)} disabled={i === 0}>▲</button>
                <button className="move-btn" onClick={() => moveMemo(m.id, 1)} disabled={i === memos.length - 1}>▼</button>
                <button className="delete-btn" onClick={() => removeMemo(m.id)}>×</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
