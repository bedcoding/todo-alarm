# 릴리즈 방법

## 1. package.json 버전 올리기

**반드시 빌드 전에 한다.** 앱 내부 버전(`Info.plist`)이 `package.json`의 `version`에서
생성되기 때문에, 빌드 후에 올리면 트레이 메뉴의 버전 표시와 업데이트 확인이
이전 버전으로 동작한다.

```bash
# package.json의 version 필드 수정
# 예: "1.11.1" → "1.12.0"
```

## 2. 커밋 & push

커밋 제목에 버전을 함께 남긴다. 예: `메모 순서를 드래그로 변경 (v1.12.0)`

```bash
git add -A
git commit
git push origin main
```

## 3. 빌드

```bash
npm run package
```

`electron-builder`가 앱과 배포용 zip을 함께 만든다. **zip을 따로 만들 필요 없다.**

| 산출물 | 용도 |
| --- | --- |
| `dist/Todo Alarm-{버전}-arm64-mac.zip` | 릴리즈에 올리는 파일 |
| `dist/mac-arm64/Todo Alarm.app` | 로컬 실행 확인용 |
| `dist/*.blockmap`, `dist/latest-mac.yml` | 자동 업데이트용. 지금은 쓰지 않으므로 올리지 않는다 |

앱에 버전이 제대로 박혔는지 확인:

```bash
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "dist/mac-arm64/Todo Alarm.app/Contents/Info.plist"
```

## 4. GitHub Release 생성

파일명에 공백이 있으니 따옴표로 감싼다.

```bash
gh release create v{버전} "dist/Todo Alarm-{버전}-arm64-mac.zip" \
  --title "Todo Alarm v{버전}" \
  --notes "변경 내용 작성"
```

업로드하면 GitHub이 공백을 점으로 바꿔 `Todo.Alarm-{버전}-arm64-mac.zip`으로 보인다.
README의 설치 안내가 이 이름을 기준으로 한다.

확인:

```bash
gh release list --limit 3   # 새 버전이 Latest인지
```

## 참고

- 배포 대상은 `bedcoding/todo-alarm`. `gh auth status`로 계정을 확인할 수 있다
- `releases/latest` URL은 항상 최신 릴리즈를 가리킨다. 앱의 업데이트 확인이 이 URL을 쓴다
- 서명은 ad-hoc이고 공증(notarization)은 하지 않는다. 그래서 받은 사람은 처음에
  우클릭 → 열기로 실행해야 한다 (README에 안내됨)
- DMG 빌드 시 권한 에러가 나면 zip 배포로 대체
