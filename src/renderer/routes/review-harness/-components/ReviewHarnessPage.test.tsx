/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import { examplePublicFlashcardsManifest } from '@shared/contracts/v1'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReviewHarnessConfig } from '@/packages/review-harness/review-harness'
import { AppSubmissionPackageSchema } from '../../../../../backend/security/submission-package'
import type { AppReviewContext } from '../../../../../backend/security/types'
import { ReviewHarnessPage } from './ReviewHarnessPage'

const reviewWorkspace = {
  getReviewContext: vi.fn(),
  startReview: vi.fn(),
  recordDecision: vi.fn(),
}

vi.mock('@/packages/trust-review/workspace', () => ({
  getTrustReviewWorkspace: () => reviewWorkspace,
}))

function renderHarness(jsx: ReactNode) {
  return render(<MantineProvider>{jsx}</MantineProvider>)
}

function attachIframeWindow(iframe: HTMLElement) {
  const contentWindow = {
    postMessage: vi.fn(),
  } as unknown as Window

  Object.defineProperty(iframe, 'contentWindow', {
    value: contentWindow,
    configurable: true,
  })

  return contentWindow
}

function dispatchRuntimeMessage(iframe: HTMLElement, payload: object, origin = 'https://staging.example.com') {
  const source = (iframe as HTMLIFrameElement).contentWindow as MessageEventSource

  window.dispatchEvent(
    new MessageEvent('message', {
      data: payload,
      origin,
      source,
    })
  )
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  })

  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  })
})

beforeEach(() => {
  vi.clearAllMocks()
})

const config: ReviewHarnessConfig = {
  appId: 'flashcards.public',
  appVersionId: 'flashcards.public@1.0.0',
  appName: 'Flashcards Coach',
  entryUrl: 'https://staging.example.com/flashcards',
  targetOrigin: 'https://staging.example.com',
  allowedOrigins: ['https://staging.example.com'],
  conversationId: 'conversation.review.1',
  appSessionId: 'review.flashcards.public',
  reviewerUserId: 'reviewer.platform',
  authState: 'not-required',
  handshakeToken: 'review.flashcards.public.review.flashcards.public',
  runtimeWarnings: [],
}

describe('ReviewHarnessPage', () => {
  it('loads review context and allows the reviewer to start review', async () => {
    const submission = AppSubmissionPackageSchema.parse({
      submissionVersion: 'v1',
      category: 'study',
      manifest: examplePublicFlashcardsManifest,
      owner: {
        ownerType: 'external-partner',
        ownerName: 'Partner Studio',
        contactName: 'Taylor Brooks',
        contactEmail: 'taylor@example.com',
        organization: 'Partner Studio',
      },
      domains: examplePublicFlashcardsManifest.allowedOrigins,
      requestedOAuthScopes: [],
      stagingUrl: examplePublicFlashcardsManifest.uiEmbedConfig.entryUrl,
      privacyPolicyUrl: `${examplePublicFlashcardsManifest.uiEmbedConfig.targetOrigin}/privacy`,
      support: {
        supportEmail: 'support@example.com',
        responsePolicy: 'School support within one business day.',
      },
      releaseNotes: 'Submission package',
      screenshots: [],
      submittedAt: '2026-04-02T12:00:00.000Z',
    })

    const context: AppReviewContext = {
      app: {
        appId: 'flashcards.public',
        slug: 'flashcards-coach',
        name: 'Flashcards Coach',
        category: 'study',
        distribution: 'public-external',
        authType: 'none',
        reviewStatus: 'pending',
        reviewState: 'submitted',
        currentVersionId: 'flashcards.public@1.0.0',
        currentVersion: {
          appVersionId: 'flashcards.public@1.0.0',
          appVersion: '1.0.0',
          manifest: examplePublicFlashcardsManifest,
          submission,
          review: {
            reviewState: 'submitted',
            runtimeReviewStatus: 'pending',
            submittedAt: '2026-04-02T12:00:00.000Z',
            validationFindings: [],
          },
          createdAt: '2026-04-02T12:00:00.000Z',
        },
        versions: [],
        createdAt: '2026-04-02T12:00:00.000Z',
        updatedAt: '2026-04-02T12:00:00.000Z',
      },
      reviews: [],
    }

    reviewWorkspace.getReviewContext.mockResolvedValue({ ok: true, value: context })
    reviewWorkspace.startReview.mockResolvedValue({
      ok: true,
      value: {
        app: context.app,
        review: {
          appReviewRecordId: 'review-1',
          appId: context.app.appId,
          appVersionId: context.app.currentVersionId,
          reviewedByUserId: 'reviewer.platform',
          reviewStatus: 'pending',
          reviewState: 'review-pending',
          decisionAction: 'start-review',
          decisionSummary: 'Review session started.',
          ageRating: 'all-ages',
          dataAccessLevel: 'minimal',
          permissionsSnapshot: ['tool:invoke'],
          createdAt: '2026-04-02T12:00:00.000Z',
          metadata: {},
        },
      },
    })

    renderHarness(<ReviewHarnessPage config={config} />)

    await waitFor(() => {
      expect(reviewWorkspace.getReviewContext).toHaveBeenCalledWith('flashcards.public', 'flashcards.public@1.0.0')
      expect(screen.getByText('Reviewer workflow')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Start review notes'), {
      target: { value: 'Kick off review with new evidence.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }))

    await waitFor(() => {
      expect(reviewWorkspace.startReview).toHaveBeenCalledWith({
        appId: 'flashcards.public',
        appVersionId: 'flashcards.public@1.0.0',
        reviewedByUserId: 'reviewer.platform',
        notes: 'Kick off review with new evidence.',
      })
    })
  })

  it('collects accepted iframe traffic and flags rejected traffic for reviewers', async () => {
    const sentAt = new Date().toISOString()

    reviewWorkspace.getReviewContext.mockResolvedValue({
      ok: false,
      code: 'app-not-found',
      domain: 'security',
      message: 'App not found.',
      retryable: false,
    })

    renderHarness(<ReviewHarnessPage config={config} />)

    const iframe = screen.getByTestId('embedded-app-host-iframe')
    attachIframeWindow(iframe)
    fireEvent.load(iframe)

    dispatchRuntimeMessage(iframe, {
      version: 'v1',
      messageId: 'msg.review.accepted',
      conversationId: config.conversationId,
      appSessionId: config.appSessionId,
      appId: config.appId,
      sequence: 1,
      sentAt,
      security: {
        handshakeToken: config.handshakeToken,
        expectedOrigin: config.targetOrigin,
      },
      source: 'app',
      type: 'app.state',
      payload: {
        status: 'active',
        summary: 'Flashcards review session is ready.',
        state: {
          topic: 'fractions',
        },
      },
    })

    dispatchRuntimeMessage(
      iframe,
      {
        version: 'v1',
        messageId: 'msg.review.rejected',
        conversationId: config.conversationId,
        appSessionId: config.appSessionId,
        appId: config.appId,
        sequence: 2,
        sentAt,
        security: {
          handshakeToken: config.handshakeToken,
          expectedOrigin: config.targetOrigin,
        },
        source: 'app',
        type: 'app.state',
        payload: {
          status: 'active',
          summary: 'Unexpected mirror traffic.',
          state: {
            topic: 'fractions',
          },
        },
      },
      'https://malicious.example.com'
    )

    await waitFor(() => {
      expect(screen.getByText('Review iframe loaded')).toBeTruthy()
      expect(screen.getByText('Runtime state update')).toBeTruthy()
      expect(screen.getAllByText('Unexpected iframe origin').length).toBeGreaterThan(0)
      expect(screen.getByText(/Raw messages:/).parentElement?.textContent).toContain('2')
      expect(screen.getByText(/Open findings:/).parentElement?.textContent).toContain('1')
    })
  })
})
