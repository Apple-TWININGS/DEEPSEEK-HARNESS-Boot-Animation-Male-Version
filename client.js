/**
 * dsh-boot-animation-male — 浏览器半（Client）
 * ==========================================
 * 出厂形态是浏览器模块：window.__ModuleLoader__ 提供一个以包名注册的懒工厂，
 * React 从平台种子 require('react') 取，不额外打包 React。
 *
 * 两侧注册：
 *   - shell.overlay      开机动画（整帧浮层，播放完淡出；可点击 / ESC 跳过）
 *   - settings.section   设置页「开机动画」：动画开关、重播、声音、壁纸选择、遮罩
 * 另外用 ctx.effect 在 body 上挂一层 z-index:-1 的壁纸层（不影响任何面板交互）。
 *
 * 所有偏好存在 localStorage；「本标签页是否已播过」存在 sessionStorage。
 */
window.__ModuleLoader__.load({
  id: 'dsh-boot-animation-male',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const PKG = 'dsh-boot-animation-male'
    const VERSION = '1.0.1'
    const STORAGE_KEY = PKG + ':settings:v1'
    const PLAYED_KEY = PKG + ':played:v1'
    const MEDIA = '/dsh-boot-animation-male/assets/'
    const REPO = 'https://github.com/Apple-TWININGS/DEEPSEEK-HARNESS-Boot-Animation-Male-Version'

    const WALLPAPERS = [
      { id: 'awake', file: 'wallpapers/awake.jpg', thumb: 'thumbs/awake.jpg', zh: '觉醒', en: 'Awake', zhNote: '睁眼 · 8.2s', enNote: 'Eyes open · 8.2s' },
      { id: 'gaze', file: 'wallpapers/gaze.jpg', thumb: 'thumbs/gaze.jpg', zh: '凝视', en: 'Gaze', zhNote: '睁眼 · 9.0s', enNote: 'Eyes open · 9.0s' },
      { id: 'silent', file: 'wallpapers/silent.jpg', thumb: 'thumbs/silent.jpg', zh: '静默', en: 'Silent', zhNote: '闭目 · 收尾', enNote: 'Eyes closed · finale' },
    ]

    const DEFAULTS = {
      boot: true,        // 开机动画总开关
      replay: true,      // 每次打开 / 刷新页面都播（关掉才用「每标签页一次」）
      muted: true,       // 默认静音（浏览器自动播放策略）
      wallpaper: 'awake',
      dim: 32,           // 壁纸遮罩 0–85，保证浅色 / 深色主题下文字可读
    }

    // ---------------- 文案 ----------------
    const TEXT = {
      zh: {
        tab: '开机动画',
        title: '开机动画 · 壁纸',
        intro: '进入 DeepSeek Harness 时先播一段 8.6 秒的蓝调开机动画，三张同主题壁纸可做页面背景。',
        bootSection: '开机动画',
        bootEnable: '启用开机动画',
        bootEnableNote: '打开页面时整帧播放，播完自动淡出',
        bootReplay: '每次刷新都播放',
        bootReplayNote: '关闭时每个标签页只在首次加载播放一次',
        bootSound: '播放声音',
        bootSoundNote: '动画本身没有音轨，开启也只是浏览器静音策略下的尝试',
        bootPreview: '重新播放',
        bootHint: '任意点击、ESC 或回车可跳过；开启系统「减少动态效果」时自动跳过。',
        wpSection: '壁纸',
        wpNone: '不使用',
        wpNoneNote: '保持默认界面',
        dim: '背景遮罩',
        dimNote: '在壁纸和界面之间加一层主题底色，数值越高越不抢字。',
        reset: '恢复默认',
        version: '版本',
        repo: 'GitHub 仓库',
        close: '完成',
        skip: '跳过 · ESC',
      },
      en: {
        tab: 'Boot animation',
        title: 'Boot animation · Wallpapers',
        intro: 'Plays an 8.6s DeepSeek-blue boot animation on load, plus three matching wallpapers for the page background.',
        bootSection: 'Boot animation',
        bootEnable: 'Enable boot animation',
        bootEnableNote: 'Full-frame playback on load, then fades out',
        bootReplay: 'Play on every reload',
        bootReplayNote: 'Off: only the first load of each tab plays it',
        bootSound: 'Play with sound',
        bootSoundNote: 'The clip has no audio track; this only attempts an unmuted start',
        bootPreview: 'Play again',
        bootHint: 'Click anywhere, ESC or Enter to skip. Honours prefers-reduced-motion.',
        wpSection: 'Wallpapers',
        wpNone: 'None',
        wpNoneNote: 'Keep the default UI',
        dim: 'Background veil',
        dimNote: 'Adds the theme base colour between wallpaper and UI; higher is easier to read.',
        reset: 'Restore defaults',
        version: 'Version',
        repo: 'GitHub repository',
        close: 'Done',
        skip: 'Skip · ESC',
      },
    }
    function localeKey() {
      const lang = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase()
      return lang.startsWith('zh') ? 'zh' : 'en'
    }
    function t(key) {
      const dict = TEXT[localeKey()] || TEXT.zh
      return dict[key] || TEXT.zh[key] || key
    }

    // ---------------- 偏好存储 ----------------
    let cached = null
    function readSettings() {
      if (cached) return cached
      let raw = null
      try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { raw = null }
      const next = Object.assign({}, DEFAULTS)
      if (raw && typeof raw === 'object') {
        if (typeof raw.boot === 'boolean') next.boot = raw.boot
        if (typeof raw.replay === 'boolean') next.replay = raw.replay
        if (typeof raw.muted === 'boolean') next.muted = raw.muted
        if (typeof raw.wallpaper === 'string' && (raw.wallpaper === 'none' || WALLPAPERS.some((w) => w.id === raw.wallpaper))) next.wallpaper = raw.wallpaper
        if (typeof raw.dim === 'number' && Number.isFinite(raw.dim)) next.dim = Math.min(85, Math.max(0, Math.round(raw.dim)))
      }
      cached = next
      return next
    }
    const settingsListeners = new Set()
    function subscribeSettings(fn) {
      settingsListeners.add(fn)
      return () => { settingsListeners.delete(fn) }
    }
    function invalidateSettings() {
      cached = null
    }
    function writeSettings(patch) {
      cached = Object.assign({}, readSettings(), patch)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cached)) } catch { /* 隐私模式忽略 */ }
      settingsListeners.forEach((fn) => { try { fn() } catch { /* 单个订阅者失败不影响其他 */ } })
      return cached
    }

    // 「立即重播」事件总线：设置页按钮 → 浮层
    const bootBus = {
      listeners: new Set(),
      fire() { this.listeners.forEach((fn) => { try { fn() } catch { /* 忽略 */ } }) },
      on(fn) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } },
    }

    // 跨浮层重挂载的状态：浮层重挂载不能把动画从头再播一遍
    const pageState = { decided: false, started: false, finished: false }

    // ---------------- 样式 ----------------
    const CSS = [
      // 壁纸层：固定在最底下，不参与任何点击
      '#dbm-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:#070b14;opacity:0;transition:opacity .5s ease}',
      '#dbm-bg.dbm-on{opacity:1}',
      '#dbm-bg .dbm-bg-img{position:absolute;inset:0;background-position:center center;background-size:cover;background-repeat:no-repeat}',
      '#dbm-bg .dbm-bg-veil{position:absolute;inset:0;background:var(--dsw-alias-bg-base);opacity:.32;transition:opacity .25s ease}',
      // 设置页
      '.dbm-page{display:flex;flex-direction:column;gap:18px;padding:2px 2px 28px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
      '.dbm-head h2{margin:0 0 6px;font-size:16px;font-weight:600;letter-spacing:.01em}',
      '.dbm-head p{margin:0;font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-secondary)}',
      '.dbm-card{display:flex;flex-direction:column;gap:13px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.dbm-card h3{margin:0;font-size:13px;font-weight:600;letter-spacing:.02em}',
      '.dbm-row{display:flex;align-items:center;justify-content:space-between;gap:18px}',
      '.dbm-row-label{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.dbm-row-label b{font-size:13px;font-weight:500}',
      '.dbm-row-label span{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.dbm-switch{display:flex;align-items:center;gap:8px;flex:0 0 auto}',
      '.dbm-switch input{width:16px;height:16px;margin:0;cursor:pointer;accent-color:var(--dsw-alias-brand-primary)}',
      '.dbm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}',
      '.dbm-thumb{position:relative;display:block;padding:0;aspect-ratio:16/9;overflow:hidden;cursor:pointer;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);font:inherit;color:inherit}',
      '.dbm-thumb img{display:block;width:100%;height:100%;object-fit:cover;opacity:.88;transition:opacity .2s ease,transform .35s ease}',
      '.dbm-thumb:hover img{opacity:1;transform:scale(1.035)}',
      '.dbm-thumb.dbm-on{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.dbm-thumb-cap{position:absolute;left:8px;bottom:7px;padding:1px 7px;border-radius:999px;background:rgba(4,8,16,.52);color:#eaf3ff;font-size:11px;letter-spacing:.02em}',
      '.dbm-thumb-none{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-style:dashed;color:var(--dsw-alias-label-tertiary);font-size:12px}',
      '.dbm-thumb-none small{font-size:10.5px;opacity:.8}',
      '.dbm-slider{display:flex;align-items:center;gap:12px}',
      '.dbm-slider input[type=range]{flex:1;min-width:0;margin:0;accent-color:var(--dsw-alias-brand-primary)}',
      '.dbm-slider output{flex:0 0 auto;width:40px;text-align:right;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dbm-hint{margin:0;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
      '.dbm-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;transition:background .15s ease}',
      '.dbm-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dbm-btn.dbm-primary{border-color:var(--dsw-alias-border-l2);font-weight:500}',
      '.dbm-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.dbm-foot .dbm-grow{flex:1 1 auto}',
      '.dbm-link{color:var(--dsw-alias-brand-primary);font-size:11.5px;text-decoration:none}',
      '.dbm-link:hover{text-decoration:underline}',
      // 开机动画浮层
      '.dbm-boot{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#04070d;cursor:pointer;opacity:1;transition:opacity .45s ease}',
      '.dbm-boot.dbm-closing{opacity:0}',
      '.dbm-boot video{display:block;width:100%;height:100%;object-fit:cover;background:#04070d}',
      '.dbm-boot-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 50% 50%,rgba(4,7,13,0) 52%,rgba(4,7,13,.55) 100%)}',
      '.dbm-boot-hud{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:20px 24px;pointer-events:none}',
      '.dbm-boot-brand{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.36em;color:rgba(190,220,255,.72)}',
      '.dbm-boot-skip{align-self:flex-end;margin-top:auto;padding:6px 12px;border-radius:999px;border:1px solid rgba(160,200,255,.28);background:rgba(8,14,26,.55);color:#dbe9ff;font:inherit;font-size:11.5px;cursor:pointer;pointer-events:auto;backdrop-filter:blur(6px)}',
      '.dbm-boot-skip:hover{background:rgba(20,34,60,.78)}',
      '.dbm-boot-progress{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.12)}',
      '.dbm-boot-progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#3c8dff,#9ad6ff);transition:width .2s linear}',
      '@media (prefers-reduced-motion: reduce){.dbm-boot{transition:none}}',
    ].join('\n')

    // ---------------- 壁纸层 ----------------
    function installBackgroundLayer(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.id = 'dbm-style'
        style.textContent = CSS

        const wrap = document.createElement('div')
        wrap.id = 'dbm-bg'
        wrap.setAttribute('aria-hidden', 'true')
        const img = document.createElement('div')
        img.className = 'dbm-bg-img'
        const veil = document.createElement('div')
        veil.className = 'dbm-bg-veil'
        wrap.appendChild(img)
        wrap.appendChild(veil)

        const paint = () => {
          const s = readSettings()
          const wp = WALLPAPERS.find((w) => w.id === s.wallpaper)
          if (wp) {
            img.style.backgroundImage = 'url("' + MEDIA + wp.file + '")'
            wrap.classList.add('dbm-on')
          } else {
            img.style.backgroundImage = ''
            wrap.classList.remove('dbm-on')
          }
          veil.style.opacity = String(s.dim / 100)
        }

        let off = () => {}
        const mount = () => {
          if (!document.getElementById('dbm-style')) document.head.appendChild(style)
          if (!document.getElementById('dbm-bg')) document.body.appendChild(wrap)
          paint()
          off = subscribeSettings(paint)
        }
        const onReady = () => { try { mount() } catch { /* 宿主结构异常时静默 */ } }
        if (document.body) onReady()
        else document.addEventListener('DOMContentLoaded', onReady, { once: true })

        return () => {
          document.removeEventListener('DOMContentLoaded', onReady)
          off()
          wrap.remove()
          style.remove()
        }
      })
    }

    // ---------------- 开机动画浮层 ----------------
    function BootOverlay() {
      const [playing, setPlaying] = useState(false)
      const [closing, setClosing] = useState(false)
      const [progress, setProgress] = useState(0)
      const [muted, setMuted] = useState(() => readSettings().muted)
      const videoRef = useRef(null)
      const closeTimer = useRef(0)

      const finish = useCallback(() => {
        pageState.finished = true
        try { sessionStorage.setItem(PLAYED_KEY, '1') } catch { /* 忽略 */ }
        setClosing(true)
        window.clearTimeout(closeTimer.current)
        closeTimer.current = window.setTimeout(() => {
          setPlaying(false)
          setClosing(false)
        }, 460)
      }, [])

      const start = useCallback(() => {
        pageState.started = true
        window.clearTimeout(closeTimer.current)
        setMuted(readSettings().muted)
        setProgress(0)
        setClosing(false)
        setPlaying(true)
      }, [])

      useEffect(() => () => { window.clearTimeout(closeTimer.current) }, [])

      // 是否播放：每次页面加载只决定一次
      useEffect(() => {
        if (pageState.decided) return
        pageState.decided = true
        const s = readSettings()
        if (!s.boot || pageState.finished) return
        if (!s.replay) {
          let played = false
          try { played = sessionStorage.getItem(PLAYED_KEY) === '1' } catch { played = false }
          if (played) return
        }
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        start()
      }, [start])

      // 设置页「重新播放」
      useEffect(() => bootBus.on(() => start()), [start])

      // 跳过（capture 阶段先于宿主面板的 Esc 处理，避免被宿主吞掉键盘事件）
      useEffect(() => {
        if (!playing) return
        const onKey = (event) => {
          if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            finish()
          }
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [playing, finish])

      // 自动播放（静音被策略拒绝时退化为强制静音）
      useEffect(() => {
        if (!playing) return
        const video = videoRef.current
        if (!video) return
        try { video.currentTime = 0 } catch { /* 元数据未就绪 */ }
        video.muted = muted
        const attempt = video.play()
        if (attempt && typeof attempt.catch === 'function') {
          attempt.catch(() => {
            video.muted = true
            const retry = video.play()
            if (retry && typeof retry.catch === 'function') retry.catch(() => finish())
          })
        }
      }, [playing, muted, finish])

      if (!playing) return null

      const onTime = (event) => {
        const video = event.currentTarget
        const duration = Number(video.duration)
        if (!Number.isFinite(duration) || duration <= 0) return
        setProgress(Math.min(1, Math.max(0, video.currentTime / duration)))
      }

      return h('div', {
        className: 'dbm-boot' + (closing ? ' dbm-closing' : ''),
        role: 'presentation',
        onClick: finish,
      },
        h('video', {
          ref: videoRef,
          src: MEDIA + 'boot.mp4',
          preload: 'auto',
          autoPlay: true,
          muted: muted,
          playsInline: true,
          onEnded: finish,
          onError: finish,
          onTimeUpdate: onTime,
          onClick: (event) => { event.stopPropagation(); finish() },
        }),
        h('div', { className: 'dbm-boot-vignette' }),
        h('div', { className: 'dbm-boot-hud' },
          h('div', { className: 'dbm-boot-brand' }, 'DEEPSEEK HARNESS'),
          h('button', {
            type: 'button',
            className: 'dbm-boot-skip',
            onClick: (event) => { event.stopPropagation(); finish() },
          }, t('skip')),
        ),
        h('div', { className: 'dbm-boot-progress' }, h('i', { style: { width: (progress * 100).toFixed(1) + '%' } })),
      )
    }

    // ---------------- 设置页 ----------------
    function SettingsPage() {
      const [state, setState] = useState(readSettings)

      useEffect(() => {
        const sync = () => { invalidateSettings(); setState(readSettings()) }
        const off = subscribeSettings(() => setState(readSettings()))
        window.addEventListener('storage', sync)
        return () => { off(); window.removeEventListener('storage', sync) }
      }, [])

      const update = (patch) => setState(writeSettings(patch))

      const rowToggle = (label, note, checked, onChange) => h('div', { className: 'dbm-row' },
        h('div', { className: 'dbm-row-label' }, h('b', null, label), h('span', null, note)),
        h('label', { className: 'dbm-switch' },
          h('input', { type: 'checkbox', checked: checked, onChange: (event) => onChange(event.target.checked) }),
        ),
      )

      const thumb = (wp) => h('button', {
        key: wp.id,
        type: 'button',
        className: 'dbm-thumb' + (state.wallpaper === wp.id ? ' dbm-on' : ''),
        title: (localeKey() === 'zh' ? wp.zhNote : wp.enNote),
        onClick: () => update({ wallpaper: wp.id }),
      },
        h('img', { src: MEDIA + wp.thumb, alt: '', loading: 'lazy', draggable: false }),
        h('span', { className: 'dbm-thumb-cap' }, localeKey() === 'zh' ? wp.zh : wp.en),
      )

      const noneCard = h('button', {
        type: 'button',
        className: 'dbm-thumb dbm-thumb-none' + (state.wallpaper === 'none' ? ' dbm-on' : ''),
        onClick: () => update({ wallpaper: 'none' }),
      },
        h('span', null, t('wpNone')),
        h('small', null, t('wpNoneNote')),
      )

      return h('div', { className: 'dbm-page' },
        h('header', { className: 'dbm-head' },
          h('h2', null, t('title')),
          h('p', null, t('intro')),
        ),

        h('section', { className: 'dbm-card' },
          h('h3', null, t('bootSection')),
          rowToggle(t('bootEnable'), t('bootEnableNote'), state.boot, (v) => update({ boot: v })),
          rowToggle(t('bootReplay'), t('bootReplayNote'), state.replay, (v) => update({ replay: v })),
          rowToggle(t('bootSound'), t('bootSoundNote'), !state.muted, (v) => update({ muted: !v })),
          h('div', { className: 'dbm-row' },
            h('p', { className: 'dbm-hint', style: { maxWidth: '62ch' } }, t('bootHint')),
            h('button', {
              type: 'button',
              className: 'dbm-btn dbm-primary',
              onClick: () => {
                update({ boot: true })
                bootBus.fire()
              },
            }, t('bootPreview')),
          ),
        ),

        h('section', { className: 'dbm-card' },
          h('h3', null, t('wpSection')),
          h('div', { className: 'dbm-grid' }, noneCard, WALLPAPERS.map(thumb)),
          h('div', { className: 'dbm-slider' },
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, t('dim')),
            h('input', {
              type: 'range', min: 0, max: 85, step: 1, value: state.dim,
              onChange: (event) => update({ dim: Number(event.target.value) }),
              'aria-label': t('dim'),
            }),
            h('output', null, state.dim + '%'),
          ),
          h('p', { className: 'dbm-hint' }, t('dimNote')),
        ),

        h('footer', { className: 'dbm-foot' },
          h('button', { type: 'button', className: 'dbm-btn', onClick: () => update(DEFAULTS) }, t('reset')),
          h('span', { className: 'dbm-grow' }),
          h('a', { className: 'dbm-link', href: REPO, target: '_blank', rel: 'noreferrer noopener' }, t('repo')),
          h('span', { className: 'dbm-hint' }, t('version') + ' ' + VERSION),
        ),
      )
    }

    // ---------------- 注册 ----------------
    return {
      inject: ['slots'],
      apply(ctx) {
        installBackgroundLayer(ctx)

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dbm-boot-overlay',
          order: 1000,
          label: 'Boot animation',
        }, BootOverlay))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dbm-boot-settings',
          order: 35,
          label: t('tab'),
        }, SettingsPage))
      },
    }
  },
})
