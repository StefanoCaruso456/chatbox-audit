import { describe, expect, it } from 'vitest'
import { approvedApps, getApprovedAppById } from './approvedApps'

describe('approvedApps', () => {
  it('includes the TutorMeAI runtime apps in the shared library', () => {
    expect(approvedApps).toHaveLength(30)

    expect(getApprovedAppById('chess-tutor')).toMatchObject({
      experience: 'tutormeai-runtime',
      launchUrl: '/embedded-apps/chess',
      runtimeBridge: {
        appId: 'chess.internal',
        initialState: {
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'w',
          moveCount: 0,
        },
      },
    })
    expect(getApprovedAppById('flashcards-coach')).toMatchObject({
      experience: 'tutormeai-runtime',
      launchUrl: '/embedded-apps/flashcards',
      runtimeBridge: {
        appId: 'flashcards.public',
      },
    })
    expect(getApprovedAppById('planner-connect')).toMatchObject({
      experience: 'tutormeai-runtime',
      launchUrl: '/embedded-apps/planner',
      runtimeBridge: {
        appId: 'planner.oauth',
      },
    })
  })

  it('keeps approved library apps pointed at their governed workspace routes', () => {
    expect(getApprovedAppById('chess-com')).toMatchObject({
      experience: 'approved-library',
      launchUrl: '/embedded-apps/catalog/chess-com',
      vendorUrl: 'https://www.chess.com/play/computer',
      integrationMode: 'partner-embed',
      integrationConfig: {
        defaultLaunchUrl: 'https://www.chess.com/emboard?id=10477955&_height=640',
        launchUrlLabel: 'Chess.com emboard URL',
      },
    })
    expect(getApprovedAppById('google-classroom')).toMatchObject({
      experience: 'approved-library',
      launchUrl: '/embedded-apps/catalog/google-classroom',
      vendorUrl: 'https://classroom.google.com/',
      integrationConfig: {
        authModel: 'oauth',
      },
    })
  })

  it('preserves Canvas-specific login guidance for district-managed access', () => {
    expect(getApprovedAppById('canvas-student')).toMatchObject({
      experience: 'approved-library',
      embedStatus: 'needs-district-url',
      launchUrl: '/embedded-apps/catalog/canvas-student',
      vendorUrl: 'https://www.instructure.com/canvas/login',
      loadingFallback: {
        title: 'Canvas needs a school-specific embedded launch link',
      },
    })
  })

  it('seeds preview-capable apps with a default launch target', () => {
    expect(getApprovedAppById('khan-academy')).toMatchObject({
      integrationMode: 'browser-session',
      integrationConfig: {
        defaultLaunchUrl: 'https://www.khanacademy.org/',
      },
    })

    expect(getApprovedAppById('desmos')).toMatchObject({
      integrationMode: 'partner-embed',
      integrationConfig: {
        defaultLaunchUrl: 'https://www.desmos.com/calculator',
      },
    })

    expect(getApprovedAppById('miro')).toMatchObject({
      integrationMode: 'partner-embed',
      integrationConfig: {
        defaultLaunchUrl: '',
        launchUrlLabel: 'Miro board or live embed URL',
        launchUrlPlaceholder: 'https://miro.com/app/board/{board_id}/ or https://miro.com/app/live-embed/{board_id}/',
        authModel: 'vendor-session',
      },
      loadingFallback: {
        title: 'Miro needs a live-embed board URL',
      },
    })
  })

  it('gives every approved library app an integration workspace config', () => {
    const approvedLibraryApps = approvedApps.filter((app) => app.experience === 'approved-library')

    expect(approvedLibraryApps).toHaveLength(27)
    approvedLibraryApps.forEach((app) => {
      expect(app.launchUrl).toBe(`/embedded-apps/catalog/${app.id}`)
      expect(app.integrationConfig?.capabilities?.length).toBeGreaterThan(0)
      expect(app.integrationConfig?.setupChecklist?.length).toBeGreaterThan(0)
      expect(app.integrationConfig?.samplePrompts?.length).toBeGreaterThan(0)
      expect(app.vendorUrl).toBeTruthy()
    })
  })
})
