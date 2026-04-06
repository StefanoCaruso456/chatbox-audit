import { describe, expect, it } from 'vitest'
import {
  buildChessComSetupString,
  type ChessComDiagram,
  extractChessComDiagramId,
  patchChessComEmboardHtml,
} from './chessComOfficialViewer'

const exampleDiagram: ChessComDiagram = {
  id: 10477955,
  type: 'chessGame',
  boardOptions: {
    coordinates: 'inside',
    flipBoard: false,
    colorScheme: 'bases',
    pieceStyle: 'neo_wood',
  },
  setup: [
    {
      pgn: '[Event "Example"]\n\n1. d4 Nf6 *',
      nodeLimits: {
        focusNode: 0,
        beginNode: 0,
        endNode: 0,
      },
      tags: {
        event: 'Example',
        white: 'White',
        black: 'Black',
      },
      variant: 'Chess',
    },
  ],
}

describe('chessComOfficialViewer', () => {
  it('extracts the diagram id from an emboard URL', () => {
    expect(extractChessComDiagramId('https://www.chess.com/emboard?id=10477955&_height=640')).toBe('10477955')
    expect(extractChessComDiagramId('10477955')).toBe('10477955')
    expect(extractChessComDiagramId('https://www.chess.com/play/computer')).toBeNull()
  })

  it('builds a diagram setup string from official Chess.com data', () => {
    const setup = buildChessComSetupString({
      diagram: exampleDiagram,
      pgn: exampleDiagram.setup[0].pgn,
    })

    expect(setup).toContain('&-diagramtype:\nchessGame')
    expect(setup).toContain('&-colorscheme:\nbases')
    expect(setup).toContain('&-piecestyle:\nneo_wood')
    expect(setup).toContain('&-pgnbody:\n[Event "Example"]')
  })

  it('patches the vendor emboard shell with a base tag, setup comment, and ready bridge', () => {
    const patched = patchChessComEmboardHtml({
      html: `
        <html>
          <head></head>
          <body>
            <div id="chess_com_diagram_2_10477955" class="chessDiagramDiv" align="center"></div>
          </body>
        </html>
      `,
      diagram: exampleDiagram,
      pgn: exampleDiagram.setup[0].pgn,
    })

    expect(patched).toContain('<base href="https://www.chess.com/">')
    expect(patched).toContain('chatbridge-chesscom-viewer')
    expect(patched).toContain('chess_com_diagram_2_10477955')
    expect(patched).toContain('&-pgnbody:')
  })
})
