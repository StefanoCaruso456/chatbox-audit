import { Box, Title } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import FeatureUnavailableNotice from '@/components/common/FeatureUnavailableNotice'
import { BuiltinServersSection } from '@/components/settings/mcp/BuiltinServersSection'
import CustomServersSection from '@/components/settings/mcp/CustomServersSection'
import { parseServerFromJson } from '@/components/settings/mcp/utils'
import type { MCPServerConfig } from '@/packages/mcp/types'
import platform from '@/platform'
import { decodeBase64 } from '@/utils/base64'

const searchSchema = z.object({
  install: z.string().optional(), // b64 encoded config
})

export const Route = createFileRoute('/settings/mcp')({
  component: RouteComponent,
  validateSearch: zodValidator(searchSchema),
})

export function RouteComponent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const searchParams = Route.useSearch()
  const [installConfig, setInstallConfig] = useState<MCPServerConfig | undefined>(undefined)
  const mcpEnabled = platform.capabilities.mcp

  // Handle install parameter from search params
  useEffect(() => {
    if (!mcpEnabled) {
      return
    }
    if (searchParams.install) {
      try {
        const config = parseServerFromJson(decodeBase64(searchParams.install))
        setInstallConfig(config)
      } catch (err) {
        console.error(err)
      }
      // Clear search params immediately after reading
      navigate({
        to: '/settings/mcp',
        search: {},
        replace: true,
      })
    }
  }, [mcpEnabled, searchParams.install, navigate])

  if (!mcpEnabled) {
    return <FeatureUnavailableNotice title={t('MCP Settings')} />
  }

  return (
    <Box p="md">
      <Title order={5}>{t('MCP Settings')}</Title>
      <Box className="mt-8">
        <BuiltinServersSection />
      </Box>
      <Box className="mt-8">
        <CustomServersSection installConfig={installConfig} />
      </Box>
    </Box>
  )
}
