import { Badge, Button, Group, Stack, Text } from '@mantine/core'
import type { MessageEmbeddedAppPart } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { useChatBridgeAppsSdk, useChatBridgeAppsSdkState } from '@/packages/apps-sdk'

function getStatusTone(part: MessageEmbeddedAppPart) {
  if (part.bridge?.completion) {
    return 'teal' as const
  }

  if (part.status === 'error') {
    return 'red' as const
  }

  if (part.bridge?.bootstrap?.authState === 'required') {
    return 'yellow' as const
  }

  return 'blue' as const
}

function getStatusLabel(part: MessageEmbeddedAppPart) {
  if (part.bridge?.completion) {
    return 'Completed in sidebar'
  }

  if (part.status === 'error') {
    return 'Needs sidebar attention'
  }

  if (part.bridge?.bootstrap?.authState === 'required') {
    return 'Awaiting sidebar auth'
  }

  return 'Active in sidebar'
}

export function EmbeddedAppSidebarNotice({ part }: { part: MessageEmbeddedAppPart }) {
  const { t } = useTranslation()
  const appsSdk = useChatBridgeAppsSdk()
  const approvedApp = appsSdk.getAppByRuntimeAppId(part.appId)
  const activeApprovedAppId = useChatBridgeAppsSdkState((state) => state.activeAppId)

  const isFocused = approvedApp ? activeApprovedAppId === approvedApp.id : false

  return (
    <div className="rounded-2xl border border-chatbox-border-primary bg-chatbox-background-secondary/70 p-4">
      <Stack gap="xs">
        <Group gap="xs" wrap="wrap">
          <Badge variant="light" color={getStatusTone(part)} size="sm">
            {getStatusLabel(part)}
          </Badge>
          <Badge variant="outline" color="gray" size="sm">
            {t('Right sidebar app')}
          </Badge>
        </Group>

        <Text size="sm" fw={600}>
          {t('{{name}} now runs in the right sidebar.', { name: part.appName })}
        </Text>

        <Text size="xs" c="dimmed">
          {part.summary ||
            t('The live app surface was moved out of the conversation so the sidebar is the only active runtime.')}
        </Text>

        {approvedApp ? (
          <Group gap="xs">
            <Button size="xs" variant="light" color="chatbox-brand" onClick={() => appsSdk.openApp(approvedApp.id)}>
              {isFocused ? t('Focus right sidebar') : t('Open in right sidebar')}
            </Button>
            <Text size="xs" c="dimmed">
              {t('Use the sidebar panel to interact with the live app.')}
            </Text>
          </Group>
        ) : null}
      </Stack>
    </div>
  )
}
