import {
  exampleAuthenticatedPlannerManifest,
  exampleInternalChessManifest,
  examplePublicFlashcardsManifest,
} from '@shared/contracts/v1'
import { describe, expect, it } from 'vitest'
import { buildPermissionSanityReport } from './permission-sanity'

describe('permission sanity checker', () => {
  it('returns a clean report for a balanced internal app', () => {
    const report = buildPermissionSanityReport(exampleInternalChessManifest)

    expect(report.verdict).toBe('clean')
    expect(report.findings).toHaveLength(0)
    expect(report.requiredPermissions).toEqual(['session:write', 'tool:invoke'])
  })

  it('blocks apps that omit permissions required by their tools', () => {
    const report = buildPermissionSanityReport({
      ...exampleInternalChessManifest,
      permissions: ['conversation:read-summary', 'tool:invoke'],
    })

    expect(report.verdict).toBe('block')
    expect(report.findings.some((finding) => finding.code === 'missing-tool-permission')).toBe(true)
    expect(report.findings.some((finding) => finding.message.includes('session:write'))).toBe(true)
  })

  it('flags public external apps that request user-facing or auth-heavy permissions', () => {
    const report = buildPermissionSanityReport({
      ...examplePublicFlashcardsManifest,
      permissions: ['tool:invoke', 'conversation:read-summary', 'session:write', 'user:read-profile', 'oauth:connect'],
    })

    expect(report.verdict).toBe('review')
    expect(report.findings.some((finding) => finding.code === 'public-external-permission-overreach')).toBe(true)
    expect(report.findings.some((finding) => finding.code === 'auth-permission-overreach')).toBe(true)
  })

  it('blocks authenticated external apps that omit oauth connect permission', () => {
    const report = buildPermissionSanityReport({
      ...exampleAuthenticatedPlannerManifest,
      permissions: ['tool:invoke'],
    })

    expect(report.verdict).toBe('block')
    expect(report.findings.some((finding) => finding.code === 'missing-oauth-connect')).toBe(true)
  })
})
