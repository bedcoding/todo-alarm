import EmptyBell from './EmptyBell'
import type { TrashItem, Schedule, Memo } from '../../types'

interface TrashTabProps {
  trash: TrashItem[]
  onRestore: (item: TrashItem) => void
  onPermanentDelete: (id: number) => void
  onEmptyAll: () => void
}

function formatRemaining(deletedAt: string): string {
  const remaining = 86400000 - (Date.now() - new Date(deletedAt).getTime())
  if (remaining <= 0) return '곧 삭제'
  const hours = Math.floor(remaining / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`
  return `${minutes}분 남음`
}

function formatItem(item: TrashItem): string {
  if (item.type === 'schedule') {
    const s = item.data as Schedule
    return `${s.date} ${s.time} ${s.content}`
  }
  return (item.data as Memo).content
}

export default function TrashTab({ trash, onRestore, onPermanentDelete, onEmptyAll }: TrashTabProps) {
  return (
    <div className="trash-tab">
      {trash.length === 0 ? (
        <EmptyBell message="휴지통이 비어 있습니다" />
      ) : (
        <>
          <div className="trash-list">
            {trash.map((item) => (
              <div key={item.id} className="trash-item">
                <div className="trash-item-info">
                  <span className="trash-item-type">{item.type === 'schedule' ? '일정' : '메모'}</span>
                  <span className="trash-item-content">{formatItem(item)}</span>
                  <span className="trash-item-remaining">{formatRemaining(item.deletedAt)}</span>
                </div>
                <div className="trash-item-actions">
                  <button className="restore-btn" onClick={() => onRestore(item)} title="복원">↩</button>
                  <button className="delete-btn" onClick={() => onPermanentDelete(item.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
          <button className="trash-empty-btn" onClick={onEmptyAll}>비우기</button>
        </>
      )}
    </div>
  )
}
