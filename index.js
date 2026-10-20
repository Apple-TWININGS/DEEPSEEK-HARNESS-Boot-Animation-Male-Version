/**
 * dsh-boot-animation-male — 宿主半（Node 侧）
 * ==========================================
 * 浏览器不能直接读本机文件，所以开机动画（MP4）和三张壁纸（JPG）必须由宿主用
 * 同源 HTTP 路由发出去。这里只做两件事：把 `assets/` 下的白名单媒体文件按
 * `GET /dsh-boot-animation-male/assets/<file>` 发出去，以及支持 Range / ETag，
 * 让 4.4 MB 的 MP4 可以边下边播、重复打开不吃带宽。
 *
 * 服务按需注入：`ctx.inject(['webServer'], ...)` 而不是 `inject: ['webServer']`。
 * 在 headless / tui 这类没有 Web 服务的组合里，硬注入会让插件行永远 pending，
 * 整个 profile 起不来；按需注入时插件照常激活、只是不注册路由。
 */
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 同源路由前缀；客户端用它拼 asset URL。 */
const ROUTE = '/dsh-boot-animation-male'
/** 打包进本包的媒体目录。 */
const ASSETS_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'assets')

const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function sendJson(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** 把请求路径解析成 assets 目录里的真实文件；越界 / 非法扩展名一律拒绝。 */
function resolveAsset(urlPath) {
  const prefix = ROUTE + '/assets/'
  if (!urlPath.startsWith(prefix)) return null
  let rel
  try {
    rel = decodeURIComponent(urlPath.slice(prefix.length))
  } catch {
    return null
  }
  if (!rel || rel.includes('\0') || rel.includes('\\') || rel.includes('..')) return null
  if (!MIME[extname(rel).toLowerCase()]) return null
  const file = normalize(join(ASSETS_DIR, rel))
  if (file !== ASSETS_DIR && !file.startsWith(ASSETS_DIR + sep)) return null
  return file
}

function serve(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }
  let urlPath
  try {
    urlPath = new URL(req.url, 'http://localhost').pathname
  } catch {
    sendJson(res, 400, { ok: false, error: 'bad request' })
    return
  }

  if (urlPath === ROUTE + '/health') {
    sendJson(res, 200, { ok: true, plugin: 'dsh-boot-animation-male', version: '1.0.2' })
    return
  }

  const file = resolveAsset(urlPath)
  if (!file) {
    sendJson(res, 404, { ok: false, error: 'not found' })
    return
  }

  let stat
  try {
    stat = statSync(file)
  } catch {
    sendJson(res, 404, { ok: false, error: 'not found' })
    return
  }
  if (!stat.isFile()) {
    sendJson(res, 404, { ok: false, error: 'not found' })
    return
  }

  const size = stat.size
  const etag = '"' + stat.mtimeMs.toString(36) + '-' + size.toString(36) + '"'
  const inm = req.headers['if-none-match']
  if (typeof inm === 'string' && inm.split(',').some((t) => {
    const v = t.trim()
    return v === etag || v === 'W/' + etag
  })) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=86400', 'Accept-Ranges': 'bytes' })
    res.end()
    return
  }

  let start = 0
  let end = size - 1
  let code = 200
  const range = req.headers.range
  if (typeof range === 'string') {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m) {
      let s = m[1] ? Number.parseInt(m[1], 10) : 0
      let e = m[2] ? Number.parseInt(m[2], 10) : size - 1
      if (!Number.isFinite(s)) s = 0
      if (!Number.isFinite(e)) e = size - 1
      if (s > e || s >= size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + size, 'Accept-Ranges': 'bytes' })
        res.end()
        return
      }
      start = s
      end = Math.min(e, size - 1)
      code = 206
    }
  }

  const headers = {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
    ETag: etag,
  }
  if (code === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size
  res.writeHead(code, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(file, { start, end })
  stream.on('error', () => {
    try { res.destroy() } catch { /* 连接已断开 */ }
  })
  stream.pipe(res)
}

export function apply(ctx) {
  ctx.inject(['webServer'], (injected) => {
    const webServer = injected.webServer
    if (!webServer || typeof webServer.register !== 'function') return
    injected.effect(() => webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: serve,
    }))
  })
}
