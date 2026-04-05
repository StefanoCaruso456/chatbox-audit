import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { createRailwayWebApp } from './railway-web-app'

const host = '0.0.0.0'
const port = Number.parseInt(process.env.PORT || '3000', 10)
const app = createRailwayWebApp()

const server = createServer(async (request, response) => {
  try {
    const webRequest = toWebRequest(request)
    const webResponse = await app.handleRequest(webRequest)
    await writeWebResponse(response, webResponse)
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`Server error: ${error instanceof Error ? error.message : String(error)}`)
  }
})

server.listen(port, host, () => {
  console.log(`TutorMeAI Railway web server listening on http://${host}:${port}`)
})

function toWebRequest(request: IncomingMessage): Request {
  const protocolHeader = request.headers['x-forwarded-proto']
  const protocol =
    typeof protocolHeader === 'string' && protocolHeader.length > 0 ? protocolHeader.split(',')[0].trim() : 'http'
  const forwardedHost = request.headers['x-forwarded-host']
  const hostHeader =
    typeof forwardedHost === 'string' && forwardedHost.length > 0
      ? forwardedHost.split(',')[0].trim()
      : (request.headers.host ?? `localhost:${port}`)
  const url = new URL(request.url ?? '/', `${protocol}://${hostHeader}`)
  const headers = new Headers()

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item)
      }
      continue
    }

    if (typeof value === 'string') {
      headers.set(key, value)
    }
  }

  const method = request.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, {
      method,
      headers,
    })
  }

  return new Request(url, {
    method,
    headers,
    body: Readable.toWeb(request) as BodyInit,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

async function writeWebResponse(response: ServerResponse, webResponse: Response) {
  response.statusCode = webResponse.status
  webResponse.headers.forEach((value, key) => {
    response.setHeader(key, value)
  })

  if (!webResponse.body) {
    response.end()
    return
  }

  const body = Readable.fromWeb(webResponse.body as never)
  await new Promise<void>((resolve, reject) => {
    body.on('error', reject)
    response.on('error', reject)
    response.on('finish', resolve)
    body.pipe(response)
  })
}
