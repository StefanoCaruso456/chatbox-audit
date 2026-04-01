import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const host = '0.0.0.0'
const port = Number.parseInt(process.env.PORT || '3000', 10)
const rootDir = resolve(process.cwd(), 'release/app/dist/renderer')
const indexFile = join(rootDir, 'index.html')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function resolveRequestedPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0] || '/')
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const requestedPath = join(rootDir, normalizedPath)
  const resolvedPath = resolve(requestedPath)

  if (!resolvedPath.startsWith(rootDir)) {
    return null
  }

  if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
    return resolvedPath
  }

  return indexFile
}

const server = createServer(async (req, res) => {
  const filePath = resolveRequestedPath(req.url || '/')

  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  const extension = extname(filePath)
  const contentType = contentTypes[extension] || 'application/octet-stream'

  try {
    if (filePath === indexFile) {
      const html = await readFile(indexFile)
      res.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      })
      res.end(html)
      return
    }

    res.writeHead(200, {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': contentType,
    })
    createReadStream(filePath).pipe(res)
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`Server error: ${error instanceof Error ? error.message : String(error)}`)
  }
})

server.listen(port, host, () => {
  console.log(`Serving Chatbox web bundle from ${rootDir}`)
  console.log(`Listening on http://${host}:${port}`)
})
