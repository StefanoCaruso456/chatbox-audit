import { type AppManifest, type AppPermission, type ToolSchema } from '@shared/contracts/v1'

export type PermissionSanitySeverity = 'info' | 'warning' | 'error'

export type PermissionSanityVerdict = 'clean' | 'review' | 'block'

export type PermissionSanityFindingCode =
  | 'missing-tool-permission'
  | 'missing-oauth-connect'
  | 'auth-permission-overreach'
  | 'public-external-permission-overreach'
  | 'internal-oauth-request'
  | 'platform-session-permission-mismatch'

export interface PermissionSanityFinding {
  code: PermissionSanityFindingCode
  severity: PermissionSanitySeverity
  message: string
  permissions: AppPermission[]
  toolNames: string[]
}

export interface PermissionSanityReport {
  appId: string
  appVersion: string
  distribution: AppManifest['distribution']
  authType: AppManifest['authType']
  declaredPermissions: AppPermission[]
  requiredPermissions: AppPermission[]
  findings: PermissionSanityFinding[]
  verdict: PermissionSanityVerdict
}

export function buildPermissionSanityReport(manifest: AppManifest): PermissionSanityReport {
  const declaredPermissions = unique(manifest.permissions)
  const requiredPermissions = unique(flattenRequiredPermissions(manifest.toolDefinitions))
  const findings: PermissionSanityFinding[] = []

  addMissingToolPermissions(findings, manifest.toolDefinitions, declaredPermissions)
  addAuthPermissionFindings(findings, manifest, declaredPermissions)
  addDistributionFindings(findings, manifest, declaredPermissions)

  return {
    appId: manifest.appId,
    appVersion: manifest.appVersion,
    distribution: manifest.distribution,
    authType: manifest.authType,
    declaredPermissions,
    requiredPermissions,
    findings,
    verdict: determineVerdict(findings),
  }
}

export function checkPermissionSanity(manifest: AppManifest): PermissionSanityReport {
  return buildPermissionSanityReport(manifest)
}

function addMissingToolPermissions(
  findings: PermissionSanityFinding[],
  tools: ToolSchema[],
  declaredPermissions: AppPermission[]
): void {
  for (const tool of tools) {
    for (const requiredPermission of tool.requiredPermissions ?? []) {
      if (declaredPermissions.includes(requiredPermission)) {
        continue
      }

      findings.push({
        code: 'missing-tool-permission',
        severity: 'error',
        message: `Tool "${tool.name}" requires permission "${requiredPermission}" but the manifest does not declare it.`,
        permissions: [requiredPermission],
        toolNames: [tool.name],
      })
    }
  }
}

function addAuthPermissionFindings(
  findings: PermissionSanityFinding[],
  manifest: AppManifest,
  declaredPermissions: AppPermission[]
): void {
  const appOAuthTools = manifest.toolDefinitions.filter((tool) => tool.authRequirement === 'app-oauth')
  const platformSessionTools = manifest.toolDefinitions.filter((tool) => tool.authRequirement === 'platform-session')
  const needsOAuthConnect = manifest.authType === 'oauth2' || appOAuthTools.length > 0
  const hasOAuthConnect = declaredPermissions.includes('oauth:connect')
  const hasSessionPermission =
    declaredPermissions.includes('session:read') || declaredPermissions.includes('session:write')

  if (needsOAuthConnect && !hasOAuthConnect) {
    findings.push({
      code: 'missing-oauth-connect',
      severity: 'error',
      message: `App "${manifest.appId}" uses OAuth-authenticated flows but does not declare permission "oauth:connect".`,
      permissions: ['oauth:connect'],
      toolNames: appOAuthTools.map((tool) => tool.name),
    })
  }

  if (manifest.authType === 'none' && hasOAuthConnect) {
    findings.push({
      code: 'auth-permission-overreach',
      severity: 'warning',
      message: `App "${manifest.appId}" declares "oauth:connect" even though its auth type is "none".`,
      permissions: ['oauth:connect'],
      toolNames: appOAuthTools.map((tool) => tool.name),
    })
  }

  if (manifest.distribution === 'internal' && hasOAuthConnect) {
    findings.push({
      code: 'internal-oauth-request',
      severity: 'warning',
      message: `Internal app "${manifest.appId}" requests "oauth:connect"; confirm whether it truly needs an external account-linking flow.`,
      permissions: ['oauth:connect'],
      toolNames: appOAuthTools.map((tool) => tool.name),
    })
  }

  if (platformSessionTools.length > 0 && !hasSessionPermission) {
    findings.push({
      code: 'platform-session-permission-mismatch',
      severity: 'warning',
      message: `App "${manifest.appId}" declares platform-session tools but does not request a session permission.`,
      permissions: ['session:read', 'session:write'],
      toolNames: platformSessionTools.map((tool) => tool.name),
    })
  }
}

function addDistributionFindings(
  findings: PermissionSanityFinding[],
  manifest: AppManifest,
  declaredPermissions: AppPermission[]
): void {
  if (manifest.distribution !== 'public-external') {
    return
  }

  const overreachPermissions = declaredPermissions.filter((permission) =>
    permission !== 'tool:invoke' && permission !== 'conversation:read-summary'
  )

  if (overreachPermissions.length === 0) {
    return
  }

  findings.push({
    code: 'public-external-permission-overreach',
    severity: 'warning',
    message:
      `Public external app "${manifest.appId}" requests permissions that should be reviewed closely for a no-user-auth flow: ` +
      overreachPermissions.join(', '),
    permissions: overreachPermissions,
    toolNames: manifest.toolDefinitions.map((tool) => tool.name),
  })
}

function flattenRequiredPermissions(tools: ToolSchema[]): AppPermission[] {
  return tools.flatMap((tool) => tool.requiredPermissions ?? [])
}

function unique(values: AppPermission[]): AppPermission[] {
  return Array.from(new Set(values))
}

function determineVerdict(findings: PermissionSanityFinding[]): PermissionSanityVerdict {
  if (findings.some((finding) => finding.severity === 'error')) {
    return 'block'
  }

  if (findings.some((finding) => finding.severity === 'warning')) {
    return 'review'
  }

  return 'clean'
}
