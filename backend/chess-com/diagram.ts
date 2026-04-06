import { z } from 'zod'

const CHESS_COM_BASE_URL = 'https://www.chess.com'

export const ChessComDiagramIdSchema = z
  .string()
  .trim()
  .regex(/^\d+$/u, {
    message: 'Chess.com diagram ids must be numeric.',
  })

export const ChessComDiagramSchema = z.object({
  id: z.number().int().nonnegative(),
  toUserId: z.number().int().nullable().optional(),
  clubId: z.number().int().nullable().optional(),
  type: z.string().trim().min(1),
  boardOptions: z.object({
    coordinates: z.string().trim().min(1).catch('inside'),
    flipBoard: z.boolean().catch(false),
    colorScheme: z.string().trim().min(1).catch('bases'),
    pieceStyle: z.string().trim().min(1).catch('neo_wood'),
  }),
  themeIds: z.record(z.string(), z.unknown()).catch({}),
  setup: z
    .array(
      z.object({
        pgn: z.string().trim().min(1),
        nodeLimits: z.object({
          focusNode: z.number().int().nonnegative().catch(0),
          beginNode: z.number().int().nonnegative().catch(0),
          endNode: z.number().int().nonnegative().catch(0),
        }),
        tags: z.record(z.string(), z.string().nullable()),
        variant: z.string().trim().min(1).catch('Chess'),
      })
    )
    .min(1),
})

export type ChessComDiagram = z.infer<typeof ChessComDiagramSchema>

function buildChessComUrl(pathname: string) {
  return new URL(pathname, CHESS_COM_BASE_URL).toString()
}

function buildUpstreamHeaders() {
  return {
    accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
    'user-agent': 'ChatBridge TutorMeAI/1.0 (+https://chatbox-audit.vercel.app)',
  }
}

export async function fetchChessComDiagram(input: {
  diagramId: string
  fetchImpl?: typeof fetch
}): Promise<ChessComDiagram> {
  const diagramId = ChessComDiagramIdSchema.parse(input.diagramId)
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(buildChessComUrl(`/callback/diagram/${diagramId}`), {
    headers: buildUpstreamHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Chess.com diagram lookup failed with status ${response.status}.`)
  }

  const payload = await response.json()
  return ChessComDiagramSchema.parse(payload)
}

export async function fetchChessComEmboardShell(input: {
  diagramId: string
  fetchImpl?: typeof fetch
}): Promise<string> {
  const diagramId = ChessComDiagramIdSchema.parse(input.diagramId)
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(buildChessComUrl(`/emboard?id=${diagramId}&_height=640`), {
    headers: buildUpstreamHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Chess.com emboard shell lookup failed with status ${response.status}.`)
  }

  return response.text()
}
