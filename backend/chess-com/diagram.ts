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
const DEFAULT_DIAGRAM_TYPE = 'chessGame'

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

export function buildChessComSetupString(input: { diagram: ChessComDiagram; pgn: string; focusNode?: number }) {
  const diagramSetup = input.diagram.setup[0]
  const colorScheme = input.diagram.boardOptions.colorScheme || 'bases'
  const pieceStyle = input.diagram.boardOptions.pieceStyle || 'neo_wood'
  const flipBoard = input.diagram.boardOptions.flipBoard ? 'true' : 'false'
  const focusNode = input.focusNode ?? diagramSetup?.nodeLimits.focusNode ?? 0
  const beginNode = diagramSetup?.nodeLimits.beginNode ?? 0
  const endNode = diagramSetup?.nodeLimits.endNode ?? 0

  return [
    '&-diagramtype:',
    input.diagram.type || DEFAULT_DIAGRAM_TYPE,
    '&-colorscheme:',
    colorScheme,
    '&-piecestyle:',
    pieceStyle,
    '&-float:',
    'left',
    '&-flip:',
    flipBoard,
    '&-size:',
    '45',
    '&-focusnode:',
    String(focusNode),
    '&-beginnode:',
    String(beginNode),
    '&-endnode:',
    String(endNode),
    '&-hideglobalbuttons:',
    'false',
    '&-pgnbody:',
    input.pgn.trim(),
    '',
  ].join('\n')
}

function escapeHtmlComment(value: string) {
  return value.replaceAll('--', '-&#45;')
}

function buildViewerBridgeScript() {
  return `
    (function () {
      var READY_TIMEOUT_MS = 5000;
      var sentReady = false;
      var HYDRATED_SELECTOR = '.chessDiagramDiv [class*="piece"], .chessDiagramDiv svg, .chessDiagramDiv canvas, .chessDiagramDiv [data-piece], .diagram-viewer-component, .embed-diagrams-component';

      function notify(type, payload) {
        try {
          window.parent.postMessage(
            Object.assign(
              {
                source: 'chatbridge-chesscom-viewer',
                type: type
              },
              payload || {}
            ),
            '*'
          );
        } catch (_error) {}
      }

      function tryReady() {
        if (sentReady) {
          return true;
        }

        var node = document.querySelector(HYDRATED_SELECTOR);
        if (!node) {
          return false;
        }

        sentReady = true;
        notify('viewer-ready', {
          height: node.offsetHeight || document.body.offsetHeight || 0
        });
        return true;
      }

      var observer = new MutationObserver(function () {
        if (tryReady()) {
          observer.disconnect();
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      window.addEventListener('load', function () {
        window.setTimeout(function () {
          if (!tryReady()) {
            notify('viewer-timeout');
          }
        }, READY_TIMEOUT_MS);
      });
    })();
  `.trim()
}

export function patchChessComEmboardHtml(input: { html: string; diagram: ChessComDiagram; pgn: string }) {
  const setupString = buildChessComSetupString({
    diagram: input.diagram,
    pgn: input.pgn,
  })
  const diagramId = input.diagram.id

  const withBaseTag = input.html.includes('<base href=')
    ? input.html
    : input.html.replace(
        /<head[^>]*>/iu,
        (match) => `${match}\n<base href="https://www.chess.com/">\n<meta name="color-scheme" content="light only">\n`
      )

  const diagramMarkupPattern = /<div id="chess_com_diagram_2_\d+" class="chessDiagramDiv"([^>]*)><\/div>/iu
  const diagramMarkup = `<div id="chess_com_diagram_2_${diagramId}" class="chessDiagramDiv"$1><!-- ${escapeHtmlComment(setupString)} --></div>`
  const withPatchedDiagram = withBaseTag.replace(diagramMarkupPattern, diagramMarkup)

  const bridgeScript = `<script>${buildViewerBridgeScript()}</script>`
  return withPatchedDiagram.includes('</body>')
    ? withPatchedDiagram.replace('</body>', `${bridgeScript}\n</body>`)
    : `${withPatchedDiagram}\n${bridgeScript}`
}
