import type { CompletionSignal, CompletionStatus } from '@shared/contracts/v1/completion-signal'
import type { AppPermissions } from '@shared/contracts/v1/permissions'
import type { EmbeddedAppMessage, RuntimeAppStatus } from '@shared/contracts/v1/runtime-messages'
import type { JsonObject } from '@shared/contracts/v1/shared'
import type { ToolSchema } from '@shared/contracts/v1/tool-schema'

export type EmbeddedAppHostState = 'idle' | 'loading' | 'ready' | 'complete' | 'error'

export type EmbeddedAppHostStateMessage = Extract<EmbeddedAppMessage, { type: 'app.state' }>
export type EmbeddedAppHostErrorMessage = Extract<EmbeddedAppMessage, { type: 'app.error' }>

export interface EmbeddedAppHostBootstrapConfig {
  launchReason: 'chat-tool' | 'resume-session' | 'manual-open'
  authState?: 'not-required' | 'connected' | 'required' | 'expired'
  grantedPermissions?: AppPermissions
  messageId?: string
  correlationId?: string
  initialState?: JsonObject
  availableTools?: ToolSchema[]
}

export interface EmbeddedAppHostPendingInvocation {
  toolCallId: string
  toolName: string
  arguments?: JsonObject
  timeoutMs?: number
  messageId?: string
  correlationId?: string
}

export interface EmbeddedAppHostCompletionSnapshot {
  status: CompletionStatus
  summary?: string
  resultPayload?: JsonObject
  errorMessage?: string
}

export interface EmbeddedAppHostRuntimeConfig {
  expectedOrigin: string
  conversationId: string
  appSessionId?: string
  handshakeToken?: string
  restartNonce?: string
  heartbeatTimeoutMs?: number
  bootstrap?: EmbeddedAppHostBootstrapConfig
  pendingInvocation?: EmbeddedAppHostPendingInvocation
  completion?: EmbeddedAppHostCompletionSnapshot
  onStateUpdate?: (message: EmbeddedAppHostStateMessage) => void
  onCompletion?: (signal: CompletionSignal) => void
  onRuntimeError?: (message: EmbeddedAppHostErrorMessage | EmbeddedAppHostTimeoutError) => void
  onHeartbeatTimeout?: (error: EmbeddedAppHostTimeoutError) => void
}

export interface EmbeddedAppHostTimeoutError {
  code: 'app.heartbeat-timeout'
  message: string
  recoverable: true
  details: {
    timeoutMs: number
  }
}

export interface EmbeddedAppHostStatusCopy {
  badge: string
  title: string
  description: string
}

export interface EmbeddedAppHostProps {
  appId: string
  appName: string
  appSlug?: string
  appSessionId?: string
  src?: string | null
  state?: EmbeddedAppHostState
  title?: string
  subtitle?: string
  description?: string
  iframeTitle?: string
  loadingLabel?: string
  errorTitle?: string
  errorMessage?: string
  height?: number | string
  sandbox?: string
  allow?: string
  className?: string
  runtime?: EmbeddedAppHostRuntimeConfig
  onRetry?: () => void
  onContinueInChat?: () => void
  onOpenInNewTab?: () => void
  onLoad?: () => void
  onError?: () => void
}

const DEFAULT_SANDBOX_TOKENS: string[] = ['allow-scripts', 'allow-forms', 'allow-popups']
const ALLOWED_SANDBOX_TOKENS = new Set<string>([
  ...DEFAULT_SANDBOX_TOKENS,
  'allow-downloads',
  'allow-modals',
  'allow-pointer-lock',
  'allow-popups-to-escape-sandbox',
  'allow-presentation',
  'allow-same-origin',
])

export function normalizeEmbeddedAppSrc(src?: string | null): string | null {
  if (typeof src !== 'string') {
    return null
  }

  const trimmed = src.trim()
  if (!trimmed) {
    return null
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return null
  }

  try {
    return new URL(trimmed).toString()
  } catch {
    return null
  }
}

export function buildEmbeddedAppSandbox(sandbox?: string): string {
  const requestedTokens = sandbox?.trim().split(/\s+/u).filter(Boolean) ?? []
  const combinedTokens = [...DEFAULT_SANDBOX_TOKENS]

  for (const token of requestedTokens) {
    if (!ALLOWED_SANDBOX_TOKENS.has(token) || combinedTokens.includes(token)) {
      continue
    }

    combinedTokens.push(token)
  }

  return combinedTokens.join(' ')
}

export function mapRuntimeStatusToHostState(status: RuntimeAppStatus): EmbeddedAppHostState {
  if (status === 'failed') {
    return 'error'
  }

  if (status === 'completed') {
    return 'complete'
  }

  if (status === 'pending') {
    return 'loading'
  }

  return 'ready'
}

export function mapCompletionStatusToHostState(status: CompletionStatus): EmbeddedAppHostState {
  if (status === 'failed' || status === 'timed-out') {
    return 'error'
  }

  return 'complete'
}

export function getEmbeddedAppStatusCopy(state: EmbeddedAppHostState): EmbeddedAppHostStatusCopy {
  if (state === 'idle') {
    return {
      badge: 'Ready',
      title: 'App ready to launch',
      description: 'The embedded app will appear here once the platform hands off the session.',
    }
  }

  if (state === 'loading') {
    return {
      badge: 'Launching',
      title: 'Loading app experience',
      description: 'The app is booting in a sandboxed iframe and syncing its initial state.',
    }
  }

  if (state === 'complete') {
    return {
      badge: 'Completed',
      title: 'App session completed',
      description: 'The app signaled completion and the chat can now follow up on the result.',
    }
  }

  if (state === 'error') {
    return {
      badge: 'Blocked',
      title: 'App failed to load',
      description: 'The host could not render the app. You can retry or continue in chat.',
    }
  }

  return {
    badge: 'Active',
    title: 'App session is active',
    description: 'The embedded app is connected and ready for postMessage updates.',
  }
}
