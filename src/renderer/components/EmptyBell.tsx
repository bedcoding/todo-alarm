interface EmptyBellProps {
  message: string
}

export default function EmptyBell({ message }: EmptyBellProps) {
  return (
    <div className="empty-bell">
      <svg viewBox="0 0 120 120" className="empty-bell-svg">
        {/* 종 몸체: 뚱뚱하고 넓은 벨 */}
        <path
          d="M60 20 C40 20 28 34 28 48 C28 54 26 62 22 72 C20 76 18 80 18 82 L102 82 C102 80 100 76 98 72 C94 62 92 54 92 48 C92 34 80 20 60 20 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        {/* 종 꼭대기 선 (머리에 붙은 막대) */}
        <line x1="60" y1="20" x2="60" y2="10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        {/* 추 (딸랑이) */}
        <path
          d="M50 82 C50 90 54 96 60 96 C66 96 70 90 70 82"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {/* 왼쪽 눈 (사각형) */}
        <rect x="44" y="50" width="7" height="7" fill="currentColor" />
        {/* 오른쪽 눈 (사각형) */}
        <rect x="69" y="50" width="7" height="7" fill="currentColor" />
        {/* 입 (시니컬) */}
        <line
          x1="50" y1="66" x2="70" y2="66"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <p className="empty-bell-message">{message}</p>
    </div>
  )
}
