# Slack Incoming Webhook 설정 가이드

Todo Alarm에서 Slack 알림을 받기 위한 설정 방법입니다.

---

## 1. Slack 앱 만들기

1. [https://api.slack.com/apps](https://api.slack.com/apps) 접속
2. **Create New App** 클릭
3. **From scratch** 선택
4. 앱 이름 입력 (예: `Todo Alarm`)
5. 알림을 받을 워크스페이스 선택
6. **Create App** 클릭

## 2. Incoming Webhooks 활성화

1. 앱 설정 페이지 왼쪽 메뉴에서 **Incoming Webhooks** 클릭
2. 상단 토글을 **On**으로 변경

## 3. Webhook URL 발급

1. 페이지 하단 **Add New Webhook to Workspace** 클릭
2. 알림을 받을 채널 선택 (예: `#todo-알림`)
3. **허용(Allow)** 클릭
4. 아래와 같은 형태의 URL이 생성됨:

```
https://hooks.slack.com/services/TXXXXX/BXXXXX/XXXXXX
```

5. **Copy** 버튼으로 URL 복사

## 4. Todo Alarm에 적용

1. Todo Alarm 설정 탭 열기
2. **Slack 연동** 토글 ON
3. **Webhook URL** 입력란에 복사한 URL 붙여넣기
4. **Slack 테스트** 버튼으로 연결 확인
5. **설정 저장** 클릭

---

## 참고

- Webhook URL은 **채널 1개에 고정**됩니다. 다른 채널로 보내려면 새 Webhook을 추가하세요.
- URL이 외부에 노출되면 누구나 메시지를 보낼 수 있으니 주의하세요.
- Slack 무료 플랜에서도 사용 가능합니다.
