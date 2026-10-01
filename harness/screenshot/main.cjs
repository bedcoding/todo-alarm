// README용 스크린샷을 찍는다.
// 실행: npm run build && npx electron harness/screenshot/main.cjs
// 결과: docs/screenshots/*.png
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/screenshots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// 팝업은 실제 앱과 같은 380x550, 탭 이름은 화면에 보이는 글자로 고른다
const SHOTS = [
  { name: 'schedule', tab: '일정' },
  { name: 'memo', tab: '메모' },
  { name: 'awaycheck', tab: '이석' },
  { name: 'duty', tab: '당직' }
]

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const win = new BrowserWindow({
    width: 380,
    height: 550,
    show: false,
    frame: false,
    backgroundColor: '#1a1a2e',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false }
  })
  await win.loadFile(path.join(ROOT, 'out/renderer/index.html'), { hash: 'popup' })
  await wait(800)
  for (const shot of SHOTS) {
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.tabs .tab')].find((b) => b.textContent.trim() === ${JSON.stringify(shot.tab)}).click()`
    )
    await wait(400)
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(OUT, `${shot.name}.png`), img.toPNG())
    console.log('saved', shot.name, img.getSize())
  }
  app.quit()
})
