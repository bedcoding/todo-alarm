# 당직표 동기화 가이드 (다음 클로드용)

> 이 파일은 본인(사용자)이 컨플루언스 당직표를 동기화하라 했을 때 클로드가 따라야 할 작업 절차를 적어둔 것이다.
> 본인이 "당직표 동기화" 류의 작업을 시키면 아래 절차대로 진행한다.

## 파일 갱신 과정

1. 슬랙에서 사람마다 슬랙id값 가져와서 아무 파일에다가 저장 (예시: /Users/맥북계정/Desktop/people.json)
2. 컨플루언스 페이지에 사람들이 매월 wiki에다가 자신이 원하는 당직일을 각자 입력함
3. 클로드한테 Atlassian MCP(`getConfluencePage`)로 wiki 본문을 직접 가져오라고 채팅으로 지시
4. 클로드가 가져온 데이터를 아무 파일에다가 저장 (예시: /Users/맥북계정/Desktop/2026-05.json)
5. 맥북앱 → 당직 탭 → '당직 알림 설정' 모달 → '파일에서 가져오기'에서 사용자가 만든 파일 경로를 넣어준 뒤 '적용하기' 버튼을 누른다.
   - 사람 파일 입력칸: `/Users/맥북계정/Desktop/people.json` (예시)
   - 월별 배정 입력칸: `/Users/맥북계정/Desktop/2026-05.json` (예시)
   - '적용하기' 버튼 → 달력 즉시 반영
6. 다음날 09시(기본)에 슬랙 당직 알림 자동 발송
7. (선택) 조회 전용 비공개 next.js 파일도 `git push` → Vercel이 비공개 프로젝트를 알아서 배포 → 팀원도 웹에서 조회 가능


## people.json 스키마

```json
[
  {
    "id": "p_hong_gildong",
    "name": "홍길동",
    "team": "backend",
    "slackUserId": "",
    "color": "hsl(212, 68%, 62%)"
  },
  {
    "id": "p_kim_chulsoo",
    "name": "김철수",
    "team": "backend",
    "slackUserId": "U07ABC123",
    "color": "hsl(28, 78%, 58%)"
  },
  {
    "id": "p_park_younghee",
    "name": "박영희",
    "team": "frontend",
    "slackUserId": "",
    "color": "hsl(258, 64%, 70%)"
  }
]
```

## assignments/YYYY-MM.json 스키마

```json
{
  "month": "2026-05",
  "entries": [
    { "date": "2026-05-12", "personIds": ["p_hong_gildong"] },
    { "date": "2026-05-13", "personIds": ["p_kim_chulsoo", "p_park_younghee"] }
  ]
}
```
