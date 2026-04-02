import { describe, expect, it } from 'vitest'
import { approvedApps, getApprovedAppById } from './approvedApps'

describe('approvedApps', () => {
  it('includes the TutorMeAI runtime apps in the shared library', () => {
    expect(approvedApps).toHaveLength(28)

    expect(getApprovedAppById('chess-tutor')).toMatchObject({
      experience: 'tutormeai-runtime',
      launchUrl: '/embedded-apps/chess',
    })
    expect(getApprovedAppById('flashcards-coach')).toMatchObject({
      experience: 'tutormeai-runtime',
      launchUrl: '/embedded-apps/flashcards',
    })
    expect(getApprovedAppById('planner-connect')).toMatchObject({
      experience: 'tutormeai-runtime',
      launchUrl: '/embedded-apps/planner',
    })
  })

  it('routes approved library apps through the shared catalog preview surface', () => {
    expect(getApprovedAppById('google-classroom')).toMatchObject({
      experience: 'approved-library',
      launchUrl: '/embedded-apps/catalog/google-classroom',
      vendorUrl: 'https://classroom.google.com/',
    })
  })

  it('preserves Canvas-specific login guidance for district-managed access', () => {
    expect(getApprovedAppById('canvas-student')).toMatchObject({
      experience: 'approved-library',
      launchUrl: '/embedded-apps/catalog/canvas-student',
      vendorUrl: 'https://www.instructure.com/canvas/login',
      loadingFallback: {
        title: 'This app needs a school-specific launch link',
        actionLabel: 'Open Canvas login',
      },
    })
  })
})
