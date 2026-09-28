const Module = require('module'); const path = require('path'); const fs = require('fs')
const USER_DATA = path.join(__dirname, 'userData')
module.exports.USER_DATA = USER_DATA
module.exports.boot = (seedExtra, opts = {}) => {
  fs.rmSync(USER_DATA, { recursive: true, force: true }); fs.mkdirSync(USER_DATA, { recursive: true })
  fs.writeFileSync(path.join(USER_DATA, 'data.json'), JSON.stringify(Object.assign({
    schedules: [], memos: [], trash: [], routines: [],
    settings: {checkInterval:43200000,scheduleEnabled:true,alertTiming:0,morningAlertEnabled:false,morningAlertTime:'09:00',slackEnabled:false,slackMethod:'webhook',slackWebhookUrl:'',slackBotToken:'',slackChannelId:''},
    awayCheck: {enabled:false,limitMinutes:20,excludeBeforeWork:true,beforeWorkTime:'09:00',excludeLunch:false,lunchStart:'12:00',lunchEnd:'13:00',excludeAfterWork:false,afterWorkTime:'18:00',excludeDays:[0,6]},
    duty: {enabled:false,alertTime:'09:00',people:[],assignments:[],slackEnabled:true,slackMethod:'webhook',slackWebhookUrl:'',slackBotToken:'',slackChannelId:'',apiUrl:'',peoplePoolCollapsed:false}
  }, seedExtra)))
  const state = { VERSION: opts.version || '1.0.0', dialogs: [], opened: [], apiCalls: 0, menu: null, readyResolve: null, reply: 1 }
  const noopWin = function () { return { loadURL:()=>{}, loadFile:()=>{}, on:()=>{}, once:()=>{},
    webContents:{send:()=>{},on:()=>{},openDevTools:()=>{}}, setPosition:()=>{}, getBounds:()=>({x:0,y:0,width:0,height:0}),
    isVisible:()=>false, show:()=>{}, hide:()=>{}, focus:()=>{}, isDestroyed:()=>false, setAlwaysOnTop:()=>{}, destroy:()=>{} } }
  noopWin.getAllWindows = () => []
  const stub = {
    app: { getPath:()=>USER_DATA, getVersion:()=>state.VERSION,
           whenReady:()=>({then:(fn)=>{state.readyResolve=fn; return {catch:()=>{}}}}), on:()=>{}, quit:()=>{}, dock:{hide:()=>{}} },
    BrowserWindow: noopWin, ipcMain:{handle:()=>{}, on:()=>{}},
    Menu:{ buildFromTemplate:(t)=>{ state.menu = t; return {} }, setApplicationMenu:()=>{} },
    Notification: function(){ return {show:()=>{}} },
    Tray: function(){ return {setToolTip:()=>{},setContextMenu:()=>{},on:()=>{},setImage:()=>{},popUpContextMenu:()=>{}} },
    nativeImage:{createFromPath:()=>({resize:()=>({setTemplateImage:()=>{}}),setTemplateImage:()=>{},isEmpty:()=>true}), createEmpty:()=>({setTemplateImage:()=>{}})},
    screen:{getCursorScreenPoint:()=>({x:0,y:0}), getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1080}}), getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080}})},
    net:{fetch:(u,...a)=>{ if(String(u).includes('api.github.com')) state.apiCalls++; return globalThis.fetch(u,...a) }},
    powerMonitor:{on:()=>{},getSystemIdleTime:()=>0},
    dialog:{ showMessageBox:async (o)=>{ state.dialogs.push(o); return { response: state.reply } } },
    shell:{ openExternal:(u)=>{ state.opened.push(u) } }
  }
  const orig = Module._resolveFilename
  Module._resolveFilename = function (r, ...x) { return r === 'electron' ? 'electron-stub' : orig.call(this, r, ...x) }
  require.cache['electron-stub'] = { id:'electron-stub', filename:'electron-stub', loaded:true, exports:stub }
  delete require.cache[require.resolve('../out/main/index.js')]
  require('../out/main/index.js')
  return state
}
module.exports.read = () => JSON.parse(fs.readFileSync(path.join(USER_DATA,'data.json'),'utf-8'))
