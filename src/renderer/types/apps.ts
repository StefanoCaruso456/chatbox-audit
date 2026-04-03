import type { AppSessionAuthState } from '@shared/contracts/v1/app-session-state'
import type { AppPermissions } from '@shared/contracts/v1/permissions'
import type { JsonObject } from '@shared/contracts/v1/shared'
import type { ToolSchema } from '@shared/contracts/v1/tool-schema'

export type GradeRange = 'Pre-K-2' | '3-5' | '6-8' | '9-12' | 'Multi-level'

export type AppCategory =
  | 'Learning Management & Communication'
  | 'Math & STEM'
  | 'Literacy & Language'
  | 'Study, Assessment & Engagement'
  | 'Creativity, Coding & Projects'

export type LaunchMode = 'iframe' | 'external'
export type AppEmbedStatus = 'verified' | 'needs-district-url'
export type AppExperience = 'approved-library' | 'tutormeai-runtime'
export type AppIntegrationMode =
  | 'runtime'
  | 'partner-embed'
  | 'api-adapter'
  | 'district-adapter'
  | 'browser-session'
  | 'native-replacement'

export type AppIntegrationAuthModel = 'none' | 'oauth' | 'district-sso' | 'vendor-session' | 'native'

export interface ApprovedAppRuntimeBridge {
  appId: string
  authState?: AppSessionAuthState
  grantedPermissions?: AppPermissions
  availableTools?: ToolSchema[]
  initialState?: JsonObject
  pendingInvocation?: {
    toolName: string
    arguments?: JsonObject
    timeoutMs?: number
    toolCallId?: string
  }
}

export interface ApprovedAppIntegrationConfig {
  defaultLaunchUrl?: string
  configurableLaunchUrl?: boolean
  launchUrlLabel?: string
  launchUrlPlaceholder?: string
  helpUrl?: string
  helpLabel?: string
  authModel?: AppIntegrationAuthModel
  capabilities?: string[]
  setupChecklist?: string[]
  samplePrompts?: string[]
  statusNote?: string
}

export interface ApprovedApp {
  id: string
  name: string
  icon: string
  shortSummary: string
  category: AppCategory
  gradeRanges: GradeRange[]
  launchUrl: string
  launchMode: LaunchMode
  integrationMode: AppIntegrationMode
  embedStatus?: AppEmbedStatus
  isApproved: boolean
  tags: string[]
  vendorUrl?: string
  experience?: AppExperience
  runtimeBridge?: ApprovedAppRuntimeBridge
  integrationConfig?: ApprovedAppIntegrationConfig
  loadingFallback?: {
    title: string
    body: string
    actionLabel?: string
  }
}

export const GRADE_RANGE_OPTIONS: GradeRange[] = ['Pre-K-2', '3-5', '6-8', '9-12', 'Multi-level']

export const APP_CATEGORY_OPTIONS: AppCategory[] = [
  'Learning Management & Communication',
  'Math & STEM',
  'Literacy & Language',
  'Study, Assessment & Engagement',
  'Creativity, Coding & Projects',
]

export const appIntegrationModeMeta: Record<AppIntegrationMode, { label: string; description: string }> = {
  runtime: {
    label: 'Runtime',
    description: 'ChatBridge-hosted app runtime with a structured postMessage bridge.',
  },
  'partner-embed': {
    label: 'Partner Embed',
    description: 'Vendor-approved widget, embed, or SDK rendered inside the ChatBridge surface.',
  },
  'api-adapter': {
    label: 'API Adapter',
    description: 'ChatBridge-owned UI backed by vendor APIs and OAuth where needed.',
  },
  'district-adapter': {
    label: 'District Adapter',
    description: 'School-managed integration that depends on district URLs, LMS launch, or LTI-like setup.',
  },
  'browser-session': {
    label: 'Browser Session',
    description: 'Controlled in-product browser surface for vendors that block standard iframe embedding.',
  },
  'native-replacement': {
    label: 'Native Replacement',
    description: 'Focused ChatBridge-native experience that recreates the needed workflow instead of embedding it.',
  },
}

export const gradeRangeMeta: Record<GradeRange, { label: string; shortLabel: string; description: string }> = {
  'Pre-K-2': {
    label: 'Early Learning',
    shortLabel: 'Early Learning',
    description: 'Pre-K-2',
  },
  '3-5': {
    label: 'Elementary',
    shortLabel: 'Elementary',
    description: 'Grades 3-5',
  },
  '6-8': {
    label: 'Middle School',
    shortLabel: 'Middle School',
    description: 'Grades 6-8',
  },
  '9-12': {
    label: 'High School',
    shortLabel: 'High School',
    description: 'Grades 9-12',
  },
  'Multi-level': {
    label: 'Multi-level',
    shortLabel: 'Multi-level',
    description: 'Spans multiple grade bands',
  },
}

export const categoryMeta: Record<AppCategory, { accent: string; label: string }> = {
  'Learning Management & Communication': {
    accent: '#3b82f6',
    label: 'Learning Management & Communication',
  },
  'Math & STEM': {
    accent: '#10b981',
    label: 'Math & STEM',
  },
  'Literacy & Language': {
    accent: '#f59e0b',
    label: 'Literacy & Language',
  },
  'Study, Assessment & Engagement': {
    accent: '#8b5cf6',
    label: 'Study, Assessment & Engagement',
  },
  'Creativity, Coding & Projects': {
    accent: '#ef4444',
    label: 'Creativity, Coding & Projects',
  },
}

export function isMultiLevelApp(app: Pick<ApprovedApp, 'gradeRanges'>) {
  return (
    app.gradeRanges.includes('Multi-level') || app.gradeRanges.filter((range) => range !== 'Multi-level').length > 1
  )
}

export function formatAppTagLabel(tag: string) {
  return tag
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
