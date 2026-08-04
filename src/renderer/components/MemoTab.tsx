import { useState, useRef, useEffect, useCallback } from 'react'
import EmptyBell from './EmptyBell'
import type { Memo } from '../../types'
import { makeId } from '../../types'

interface MemoTabProps {
  memos: Memo[]
  onSave: (memos: Memo[]) => void
  onDelete: (id: number) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 작성일 표기. 올해면 M/D(요일), 지난해면 연도까지 */
function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const label = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`
  return d.getFullYear() === new Date().getFullYear() ? label : `${d.getFullYear()}. ${label}`
}

export default function MemoTab({ memos, onSave, onDelete }: MemoTabProps) {
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [listAtBottom, setListAtBottom] = useState(false)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  /** 드롭될 자리. 0 = 맨 위, memos.length = 맨 아래 */
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  /** 툴팁은 스크롤 영역 밖(.memo-tab)에 띄운다. above=항목 위쪽으로 표시 */
  const [tooltip, setTooltip] = useState<{ memo: Memo; top: number; above: boolean } | null>(null)
  const tabRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef<number | null>(null)
  const scrollDirRef = useRef(0)
  const lastClientYRef = useRef(0)

  const checkScrollBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10
    setListAtBottom(atBottom)
  }, [])

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current)
      autoScrollRef.current = null
    }
    scrollDirRef.current = 0
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    checkScrollBottom()
    const obs = new ResizeObserver(checkScrollBottom)
    obs.observe(el)
    return () => {
      obs.disconnect()
      stopAutoScroll()
    }
  }, [checkScrollBottom, stopAutoScroll])

  /**
   * 마우스 Y좌표로 삽입 위치를 계산한다. 항목의 상/하 절반을 기준으로 하므로
   * 목록 위쪽 여백이나 입력창 근처에서 놓아도 맨 위(0)로 판정된다.
   */
  const computeDropIndex = (clientY: number): number => {
    const el = listRef.current
    if (!el) return memos.length
    const items = el.querySelectorAll<HTMLElement>('.memo-item')
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return i
    }
    return items.length
  }

  const autoScrollStep = () => {
    const el = listRef.current
    const dir = scrollDirRef.current
    if (!el || dir === 0) {
      stopAutoScroll()
      return
    }
    const before = el.scrollTop
    el.scrollTop = before + dir * 8
    // 끝에 닿으면 더 돌 필요 없음
    if (el.scrollTop === before) {
      stopAutoScroll()
      return
    }
    setDropIndex(computeDropIndex(lastClientYRef.current))
    autoScrollRef.current = requestAnimationFrame(autoScrollStep)
  }

  /** 목록 위/아래 끝 근처에서 자동 스크롤. 더 스크롤할 수 없으면 멈춘다 */
  const updateAutoScroll = (clientY: number) => {
    const el = listRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const EDGE = 26
    let dir = 0
    if (clientY < rect.top + EDGE) dir = -1
    else if (clientY > rect.bottom - EDGE) dir = 1
    if (dir === -1 && el.scrollTop <= 0) dir = 0
    if (dir === 1 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1) dir = 0
    scrollDirRef.current = dir
    if (dir === 0) {
      stopAutoScroll()
      return
    }
    if (autoScrollRef.current === null) {
      autoScrollRef.current = requestAnimationFrame(autoScrollStep)
    }
  }

  const addMemo = () => {
    if (!content.trim()) return
    const newMemo: Memo = {
      id: makeId(),
      content: content.trim(),
      createdAt: new Date().toISOString()
    }
    onSave([newMemo, ...memos])
    setContent('')
  }

  const removeMemo = (id: number) => {
    onDelete(id)
  }

  const hideTooltip = () => setTooltip(null)

  /** 항목이 목록 아래쪽 절반에 있으면 위로 띄워 탭 밖으로 밀려나지 않게 한다 */
  const showTooltip = (m: Memo, target: HTMLElement) => {
    const tab = tabRef.current
    if (!tab) return
    const tabRect = tab.getBoundingClientRect()
    const r = target.getBoundingClientRect()
    const above = r.top - tabRect.top > tabRect.height / 2
    setTooltip({
      memo: m,
      top: above ? r.top - tabRect.top - 6 : r.bottom - tabRect.top + 6,
      above
    })
  }

  const startEdit = (m: Memo) => {
    hideTooltip()
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

  const resetDrag = () => {
    setDraggingId(null)
    setDropIndex(null)
    stopAutoScroll()
  }

  const handleDragStart = (e: React.DragEvent, id: number) => {
    hideTooltip()
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox는 setData 필요
    e.dataTransfer.setData('text/plain', String(id))
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (draggingId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    lastClientYRef.current = e.clientY
    setDropIndex(computeDropIndex(e.clientY))
    updateAutoScroll(e.clientY)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (draggingId === null) return
    // 자식 요소 간 이동은 무시하고, 탭 영역을 실제로 벗어날 때만 정리
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDropIndex(null)
    stopAutoScroll()
  }

  const handleDrop = (e: React.DragEvent) => {
    if (draggingId === null) return
    e.preventDefault()
    const from = memos.findIndex((m) => m.id === draggingId)
    const insertAt = computeDropIndex(e.clientY)
    resetDrag()
    if (from < 0) return
    // 자기 자리를 제거하면 뒤쪽 인덱스가 한 칸 밀린다
    const to = insertAt > from ? insertAt - 1 : insertAt
    if (to === from) return
    const updated = [...memos]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    onSave(updated)
  }

  /** 드롭될 자리를 가로선으로 표시. 제자리면 표시하지 않는다 */
  const dropIndicatorClass = (i: number): string => {
    if (draggingId === null || dropIndex === null) return ''
    const from = memos.findIndex((m) => m.id === draggingId)
    if (from < 0 || dropIndex === from || dropIndex === from + 1) return ''
    if (dropIndex === i) return ' drop-above'
    if (dropIndex === memos.length && i === memos.length - 1) return ' drop-below'
    return ''
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      addMemo()
    }
  }

  return (
    <div
      className="memo-tab"
      ref={tabRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
      <div className={`scroll-fade-wrapper${listAtBottom ? ' at-bottom' : ''}`}>
        <div
          className="memo-list"
          ref={listRef}
          onScroll={() => {
            checkScrollBottom()
            hideTooltip()
          }}
        >
          {memos.length === 0 ? (
            <EmptyBell message="메모를 추가해보세요" />
          ) : (
            memos.map((m, i) => (
              <div
                key={m.id}
                className={`memo-item slim${draggingId === m.id ? ' dragging' : ''}${dropIndicatorClass(i)}`}
                draggable={editingId !== m.id}
                onDragStart={(e) => handleDragStart(e, m.id)}
                onDragEnd={resetDrag}
              >
                <span className="memo-grip" title="드래그해서 순서 변경">⠿</span>
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
                  <span
                    className="memo-content-wrap"
                    onClick={() => startEdit(m)}
                    onMouseEnter={(e) => showTooltip(m, e.currentTarget)}
                    onMouseLeave={hideTooltip}
                  >
                    <span className="memo-content-inline">{m.content}</span>
                  </span>
                )}
                <div className="memo-actions">
                  <button className="delete-btn" onClick={() => removeMemo(m.id)}>×</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {tooltip && (
        <div
          className={`memo-floating-tooltip${tooltip.above ? ' above' : ''}`}
          style={{ top: tooltip.top }}
        >
          {tooltip.memo.content}
          {tooltip.memo.createdAt && (
            <span className="memo-tooltip-date">{formatCreatedAt(tooltip.memo.createdAt)} 작성</span>
          )}
        </div>
      )}
    </div>
  )
}
