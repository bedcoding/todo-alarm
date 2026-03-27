# Slack 연동 설정 가이드

Todo Alarm에서 Slack 알림을 받기 위한 설정 방법입니다.
두 가지 방식을 지원합니다:

- **Webhook URL** — 간단 설정, 채널 1개 고정
- **Bot Token** — 여러 채널 지원, 메시지 커스터마이징 가능

---

## 1. Slack 워크스페이스 만들기 (없으면)

회사 워크스페이스는 앱 설치 권한이 필요하므로, 개인 워크스페이스를 만들어서 사용하는 것을 권장합니다.

1. [https://slack.com/create](https://slack.com/create) 접속
2. 이메일 입력 후 인증코드 확인
3. 워크스페이스 이름 입력 (예: `내 알림`)
4. 채널 이름 입력 (예: `#todo-알림`) → 나중에 Webhook에 연결할 채널
5. 초대 단계는 **Skip** 가능

> 이미 사용할 워크스페이스가 있으면 이 단계는 건너뛰세요.

## 2. Slack 앱 만들기

1. [https://api.slack.com/apps](https://api.slack.com/apps) 접속
2. **Create an App** 클릭
3. **From scratch** 선택
4. 앱 이름 입력 (예: `Todo Alarm`)
5. 1단계에서 만든 워크스페이스 선택
6. **Create App** 클릭

---

# 방법 A: Webhook URL 방식

## 3. Incoming Webhooks 활성화 및 URL 발급

1. 앱 설정 페이지 왼쪽 메뉴에서 **Incoming Webhooks** 클릭
2. 상단 토글을 **On**으로 변경
3. 페이지 하단 **Add New Webhook to Workspace** 클릭
4. 알림을 받을 채널 선택 (예: `#todo-알림`)
5. **허용(Allow)** 클릭
6. 아래와 같은 형태의 URL이 생성됨:

```
https://hooks.slack.com/services/TXXXXX/BXXXXX/XXXXXX
```

7. **Copy** 버튼으로 URL 복사

## 4. Todo Alarm에 적용

1. Todo Alarm 설정 탭 열기
2. **Slack 연동** 토글 ON
3. 연동 방식: **Webhook URL** 선택
4. 복사한 URL 붙여넣기
5. **Slack 테스트** 버튼으로 연결 확인
6. **설정 저장** 클릭

---

# 방법 B: Bot Token 방식

Bot Token은 여러 채널에 메시지를 보낼 수 있고, 채널 ID만 바꾸면 됩니다.

## 3. Bot Token 발급

1. 앱 설정 페이지 왼쪽 메뉴에서 **OAuth & Permissions** 클릭
2. **Scopes** 섹션에서 **Bot Token Scopes**에 `chat:write` 추가
3. 페이지 상단 **Install to Workspace** 클릭 → **허용(Allow)**
4. **Bot User OAuth Token** 복사 (형태: `xoxb-...`)

## 4. 채널 ID 확인

1. Slack 앱에서 알림 받을 채널 열기
2. 채널 이름 클릭 → 하단에 **채널 ID** 표시 (형태: `C01XXXXXXXX`)
3. 복사

> Bot을 해당 채널에 초대해야 메시지를 보낼 수 있습니다. 채널에서 `/invite @앱이름` 입력.

## 5. Todo Alarm에 적용

1. Todo Alarm 설정 탭 열기
2. **Slack 연동** 토글 ON
3. 연동 방식: **Bot Token** 선택
4. Bot Token과 채널 ID 입력
5. **Slack 테스트** 버튼으로 연결 확인
6. **설정 저장** 클릭

---

## 참고

- **Webhook URL**: 채널 1개에 고정. URL이 노출되면 누구나 메시지를 보낼 수 있으니 주의.
- **Bot Token**: 여러 채널 사용 가능. 채널 ID만 변경하면 됨. Token 노출 주의.
- 두 방식 모두 Slack 무료 플랜에서 사용 가능합니다.
