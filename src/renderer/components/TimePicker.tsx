import { useRef, useEffect, useCallback } from 'react'

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

const ITEM_HEIGHT = 32
const PAD_COUNT = 2

function ScrollColumn({ items, selected, onSelect }: {
  items: string[]
  selected: string
  onSelect: (v: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const programmatic = useRef(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>()
  const mounted = useRef(false)

  const scrollToIndex = useCallback((idx: number, smooth: boolean) => {
    if (!ref.current) return
    programmatic.current = true
    ref.current.scrollTo({
      top: idx * ITEM_HEIGHT,
      behavior: smooth ? 'smooth' : 'auto'
    })
    setTimeout(() => { programmatic.current = false }, smooth ? 250 : 50)
  }, [])

  useEffect(() => {
    const idx = items.indexOf(selected)
    if (idx >= 0) {
      scrollToIndex(idx, mounted.current)
      mounted.current = true
    }
  }, [selected, items, scrollToIndex])

  const handleScroll = useCallback(() => {
    if (programmatic.current || !ref.current) return

    clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => {
      if (!ref.current) return
      const idx = Math.round(ref.current.scrollTop / ITEM_HEIGHT)
      const clamped = Math.max(0, Math.min(idx, items.length - 1))

      programmatic.current = true
      ref.current.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' })
      setTimeout(() => { programmatic.current = false }, 250)

      if (items[clamped] !== selected) {
        onSelect(items[clamped])
      }
    }, 100)
  }, [items, selected, onSelect])

  const handleClick = useCallback((item: string) => {
    onSelect(item)
  }, [onSelect])

  return (
    <div className="tp-column" ref={ref} onScroll={handleScroll}>
      <div style={{ height: PAD_COUNT * ITEM_HEIGHT }} />
      {items.map((item) => (
        <div
          key={item}
          className={`tp-item ${item === selected ? 'tp-selected' : ''}`}
          onClick={() => handleClick(item)}
        >
          {item}
        </div>
      ))}
      <div style={{ height: PAD_COUNT * ITEM_HEIGHT }} />
    </div>
  )
}

export default function TimePicker({ value, onChange }: TimePickerProps) {
  const [h, m] = value.split(':')
  const hour = h ?? '00'
  const minute = m ?? '00'

  return (
    <div className="tp-container">
      <ScrollColumn items={HOURS} selected={hour} onSelect={(v) => onChange(`${v}:${minute}`)} />
      <div className="tp-separator">:</div>
      <ScrollColumn items={MINUTES} selected={minute} onSelect={(v) => onChange(`${hour}:${v}`)} />
      <div className="tp-highlight" />
    </div>
  )
}
