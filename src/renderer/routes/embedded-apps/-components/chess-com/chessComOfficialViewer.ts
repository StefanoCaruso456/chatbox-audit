export type ChessComDiagram = {
  id: number
  type: string
  boardOptions: {
    coordinates: string
    flipBoard: boolean
    colorScheme: string
    pieceStyle: string
  }
  setup: Array<{
    pgn: string
    nodeLimits: {
      focusNode: number
      beginNode: number
      endNode: number
    }
    tags: Record<string, string | null>
    variant: string
  }>
}

const DEFAULT_DIAGRAM_TYPE = 'chessGame'

export function extractChessComDiagramId(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    const id = parsed.searchParams.get('id')
    return id && /^\d+$/u.test(id) ? id : null
  } catch {
    return /^\d+$/u.test(trimmed) ? trimmed : null
  }
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
  // Chess.com parses its viewer config from the comment body, so entities like
  // `&amp;-pgnbody:` would break the official diagram parser. Only neutralize the
  // comment terminator sequence.
  return value.replaceAll('--', '-&#45;')
}

function buildViewerBridgeScript() {
  return `
    (function () {
      var READY_SELECTOR = '.diagram-viewer-component, .embed-diagrams-component';
      var READY_TIMEOUT_MS = 4000;
      var sentReady = false;

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

        var node = document.querySelector(READY_SELECTOR);
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
