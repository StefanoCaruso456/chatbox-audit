import { describe, expect, it } from 'vitest'
import {
  AppManifestSchema,
  AppSessionStateSchema,
  CompletionSignalSchema,
  ConversationAppContextSchema,
  EmbeddedAppMessageSchema,
  exampleActiveChessSessionState,
  exampleAppCompletionMessage,
  exampleAppErrorMessage,
  exampleAppManifests,
  exampleAuthenticatedPlannerManifest,
  exampleChessLaunchToolSchema,
  exampleCompletionSignals,
  exampleConversationAppContext,
  exampleEmbeddedAppMessages,
  exampleFlashcardsStartToolSchema,
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
  exampleToolSchemas,
  deriveTutorMeAIUserPermissions,
  ToolSchemaSchema,
  TutorMeAIReviewerAccessContextSchema,
  validateAppManifest,
  validateAppSessionState,
  validateCompletionSignal,
  validateConversationAppContext,
  validateEmbeddedAppMessage,
  validateToolSchema,
  TutorMeAIUserProfileRecordSchema,
} from '.'

describe('AppManifestSchema', () => {
  it('accepts the example manifests', () => {
    for (const manifest of exampleAppManifests) {
      expect(() => AppManifestSchema.parse(manifest)).not.toThrow()
    }
  })

  it('rejects an invalid authType', () => {
    const invalidManifest = {
      ...exampleInternalChessManifest,
      authType: 'magic-ticket',
    }

    const result = validateAppManifest(invalidManifest)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('authType'))).toBe(true)
    }
  })

  it('rejects missing toolDefinitions', () => {
    const invalidManifest = { ...examplePublicFlashcardsManifest }
    delete (invalidManifest as { toolDefinitions?: unknown[] }).toolDefinitions

    const result = validateAppManifest(invalidManifest)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('toolDefinitions'))).toBe(true)
    }
  })

  it('rejects tool permissions that are not granted by the manifest', () => {
    const invalidManifest = {
      ...exampleInternalChessManifest,
      permissions: ['conversation:read-summary'],
    }

    const result = validateAppManifest(invalidManifest)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('requiredPermissions'))).toBe(true)
    }
  })

  it('rejects authenticated external apps that omit oauth config', () => {
    const invalidManifest = {
      ...exampleAuthenticatedPlannerManifest,
      authConfig: undefined,
    }

    const result = validateAppManifest(invalidManifest)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('authConfig'))).toBe(true)
    }
  })

  it('rejects public external apps whose tools require session auth', () => {
    const invalidManifest = {
      ...examplePublicFlashcardsManifest,
      toolDefinitions: [
        {
          ...exampleFlashcardsStartToolSchema,
          authRequirement: 'platform-session',
        },
      ],
    }

    const result = validateAppManifest(invalidManifest)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('authRequirement'))).toBe(true)
    }
  })
})

describe('ToolSchemaSchema', () => {
  it('accepts the example tool schemas', () => {
    for (const tool of exampleToolSchemas) {
      expect(() => ToolSchemaSchema.parse(tool)).not.toThrow()
    }
  })

  it('rejects required fields that are missing from object properties', () => {
    const result = validateToolSchema({
      ...exampleChessLaunchToolSchema,
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
          },
        },
        required: ['difficulty'],
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('Required field "difficulty"'))).toBe(true)
    }
  })
})

describe('EmbeddedAppMessageSchema', () => {
  it('accepts the example runtime messages', () => {
    for (const message of exampleEmbeddedAppMessages) {
      expect(() => EmbeddedAppMessageSchema.parse(message)).not.toThrow()
    }
  })

  it('rejects malformed runtime messages', () => {
    const result = validateEmbeddedAppMessage({
      version: 'v1',
      messageId: 'msg.bad.1',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.1',
      appId: exampleInternalChessManifest.appId,
      sequence: 0,
      sentAt: '2026-03-31T15:00:00.000Z',
      source: 'app',
      type: 'app.state',
      security: {
        handshakeToken: 'nonce-123',
        expectedOrigin: 'https://chatbridge.dev',
      },
      payload: {
        status: 'active',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('payload.summary'))).toBe(true)
    }
  })

  it('keeps completion and error payloads machine-readable', () => {
    expect(exampleAppCompletionMessage.type).toBe('app.complete')
    expect(exampleAppErrorMessage.type).toBe('app.error')
    expect(() => EmbeddedAppMessageSchema.parse(exampleAppCompletionMessage)).not.toThrow()
    expect(() => EmbeddedAppMessageSchema.parse(exampleAppErrorMessage)).not.toThrow()
  })

  it('rejects completion payloads whose ids drift from the message envelope', () => {
    const result = validateEmbeddedAppMessage({
      ...exampleAppCompletionMessage,
      payload: {
        ...exampleCompletionSignals[0],
        conversationId: 'conversation.other',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('conversationId'))).toBe(true)
    }
  })
})

describe('CompletionSignalSchema', () => {
  it('accepts example completion signals across internal, public, and authenticated app flows', () => {
    for (const signal of exampleCompletionSignals) {
      expect(() => CompletionSignalSchema.parse(signal)).not.toThrow()
    }
  })

  it('rejects a completion signal whose timestamps are out of order', () => {
    const result = validateCompletionSignal({
      version: 'v1',
      conversationId: 'conversation.1',
      appSessionId: 'app-session.1',
      appId: 'chess.internal',
      status: 'failed',
      resultSummary: 'The app timed out.',
      startedAt: '2026-03-31T15:05:00.000Z',
      completedAt: '2026-03-31T15:00:00.000Z',
      followUpContext: {
        summary: 'Ask the user if they want to retry.',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('completedAt'))).toBe(true)
    }
  })
})

describe('TutorMeAI user profile contracts', () => {
  it('derives reviewer permissions from role without duplicating policy logic in the UI', () => {
    expect(deriveTutorMeAIUserPermissions('student').canApproveApp).toBe(false)
    expect(deriveTutorMeAIUserPermissions('teacher').canRequestAppReview).toBe(true)
    expect(deriveTutorMeAIUserPermissions('school_admin').canApproveApp).toBe(true)
    expect(deriveTutorMeAIUserPermissions('district_admin').canManageSafetySettings).toBe(true)
  })

  it('validates stored profile records and reviewer access snapshots', () => {
    expect(() =>
      TutorMeAIUserProfileRecordSchema.parse({
        userId: 'school.admin',
        displayName: 'School Admin',
        email: 'admin@school.edu',
        role: 'school_admin',
        metadata: {},
        createdAt: '2026-04-01T12:00:00.000Z',
        updatedAt: '2026-04-01T12:00:00.000Z',
        deletedAt: null,
      })
    ).not.toThrow()

    expect(() =>
      TutorMeAIReviewerAccessContextSchema.parse({
        userId: 'district.admin',
        role: 'district_admin',
        permissions: deriveTutorMeAIUserPermissions('district_admin'),
      })
    ).not.toThrow()
  })
})

describe('AppSessionStateSchema', () => {
  it('accepts a valid active app session state', () => {
    expect(() => AppSessionStateSchema.parse(exampleActiveChessSessionState)).not.toThrow()
  })

  it('rejects a completed session without completion payload', () => {
    const result = validateAppSessionState({
      ...exampleActiveChessSessionState,
      status: 'completed',
      isActive: false,
      completedAt: '2026-03-31T15:10:00.000Z',
      completion: undefined,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('completion'))).toBe(true)
    }
  })
})

describe('ConversationAppContextSchema', () => {
  it('accepts a valid conversation app context', () => {
    expect(() => ConversationAppContextSchema.parse(exampleConversationAppContext)).not.toThrow()
  })

  it('rejects an active app that is missing from the session timeline', () => {
    const invalidContext = {
      ...exampleConversationAppContext,
      sessionTimeline: exampleConversationAppContext.sessionTimeline.filter(
        (session) => session.appSessionId !== exampleConversationAppContext.activeApp?.appSessionId
      ),
    }

    const result = validateConversationAppContext(invalidContext)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((error) => error.includes('activeApp'))).toBe(true)
    }
  })
})
