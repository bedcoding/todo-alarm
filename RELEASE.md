# 릴리즈 방법

## 1. 빌드

```bash
npm run package
```

빌드 결과물: `dist/mac-arm64/Todo Alarm.app`

## 2. zip 생성

```bash
cd dist
zip -r -y "Todo-Alarm-{버전}-mac-arm64.zip" "mac-arm64/Todo Alarm.app"
```

## 3. GitHub Release 생성

```bash
gh release create v{버전} dist/Todo-Alarm-{버전}-mac-arm64.zip \
  --title "Todo Alarm v{버전}" \
  --notes "변경 내용 작성"
```

## 4. package.json 버전 올리기

```bash
# package.json의 version 필드 수정
# 예: "1.0.0" → "1.1.0"
```

## 참고

- DMG 빌드 시 권한 에러가 나면 zip 배포로 대체
- `releases/latest` URL은 항상 최신 릴리즈를 가리킴
