import { useState } from 'react'
import { createPortal } from 'react-dom'
import TimePicker from './TimePicker'

interface TimeFieldProps {
  value: string // "HH:MM"
  onChange: (value: string) => void
}

/**
 * 시각을 24시간제로 보여 주고, 누르면 선택기를 띄우는 버튼.
 *
 * 기본 시각 입력(input type="time")은 시스템이 12시간제면 "오전 12:00"으로 보인다.
 * 정오를 넣으려다 자정이 저장되는 일이 있어서 설정 화면의 시각 입력은 전부 이것을 쓴다.
 */
export default function TimeField({ value, onChange }: TimeFieldProps) {
  // 선택기가 열려 있는 동안 고르고 있는 값이다.
  // null이면 닫힌 상태다.
  const [pending, setPending] = useState<string | null>(null)

  // 고르는 도중의 값은 밖으로 내보내지 않고 닫을 때 한 번만 반영한다.
  // 설정은 값이 바뀌는 즉시 저장되고 알림이 다시 예약되는데, 스크롤하다 지나친 시각이 이미 지난 시각이면 그 자리에서 알림이 나가 버린다.
  const close = () => {
    if (pending !== null && pending !== value) onChange(pending)
    setPending(null)
  }

  return (
    <>
      <button type="button" className="time-field-btn" onClick={() => setPending(value)}>
        {(pending ?? value) || '--:--'}
      </button>
      {/* 설정 모달에는 transform이 걸려 있어서 그 안에 두면 fixed 기준이 모달로 바뀐다. */}
      {/* 화면 가운데에 띄우려고 body에 붙인다. */}
      {pending !== null &&
        createPortal(
          <>
            <div className="picker-overlay time-field-overlay" onClick={close} />
            <div className="picker-dropdown picker-center time-field-dropdown">
              <TimePicker value={pending} onChange={setPending} />
              <button className="picker-close-btn" onClick={close}>
                닫기
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  )
}
