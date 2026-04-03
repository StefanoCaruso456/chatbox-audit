import { describe, expect, it } from 'vitest'
import { approvedApps, getApprovedAppById } from './approvedApps'

describe('approvedApps', () => {
  it('includes the TutorMeAI runtime apps in the shared library', () => {
    expect(approvedApps).toHaveLength(28)

    expect(getApprovedAppById('chess-tutor')).toMatchObject({
      experience: 'tutormeai-runtime',
      launchUrl: '/embedded-apps/chess',
      runtimeBridge: {
        appId: 'chess.internal',
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

  it('keeps approved library apps pointed at their real iframe launch urls', () => {
    expect(getApprovedAppById('google-classroom')).toMatchObject({
      experience: 'approved-library',
      launchUrl: 'https://classroom.google.com/',
      vendorUrl: 'https://classroom.google.com/',
    })
  })

  it('preserves Canvas-specific login guidance for district-managed access', () => {
    expect(getApprovedAppById('canvas-student')).toMatchObject({
      experience: 'approved-library',
      embedStatus: 'needs-district-url',
      launchUrl: 'https://www.instructure.com/canvas',
      vendorUrl: 'https://www.instructure.com/canvas/login',
      loadingFallback: {
        title: 'Canvas needs a school-specific embedded launch link',
      },
    })
  })
})
