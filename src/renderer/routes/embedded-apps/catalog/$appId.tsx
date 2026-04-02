import { Badge, Box, Container, Flex, Stack, Text, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { getApprovedAppById } from '@/data/approvedApps'
import AppCategoryBadge from '@/components/apps/AppCategoryBadge'
import AppGradeBadge from '@/components/apps/AppGradeBadge'
import AppIcon from '@/components/apps/AppIcon'

export const Route = createFileRoute('/embedded-apps/catalog/$appId')({
  component: ApprovedAppPlaceholderRoute,
})

function ApprovedAppPlaceholderRoute() {
  const { appId } = Route.useParams()
  const app = getApprovedAppById(appId)

  if (!app) {
    return (
      <Box h="100%" bg="#0f172a" c="white">
        <Container size="sm" py="xl">
          <Stack gap="sm">
            <Title order={2}>App not found</Title>
            <Text c="rgba(255,255,255,0.76)">The requested approved app placeholder could not be loaded.</Text>
          </Stack>
        </Container>
      </Box>
    )
  }

  return (
    <Box
      h="100%"
      style={{
        background:
          'radial-gradient(circle at top, rgba(59,130,246,0.25), transparent 38%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
      }}
    >
      <Container size="sm" py="xl">
        <Stack gap="lg">
          <Badge radius="xl" size="lg" variant="light" color="green">
            Internal preview route
          </Badge>

          <Flex align="center" gap="md">
            <AppIcon app={app} w={64} h={64} radius="xl" />
            <Stack gap={4}>
              <Title order={1} c="white">
                {app.name}
              </Title>
              <Text c="rgba(255,255,255,0.72)" maw={560}>
                {app.shortSummary}
              </Text>
            </Stack>
          </Flex>

          <Flex wrap="wrap" gap="xs">
            <AppCategoryBadge category={app.category} />
            {app.gradeRanges.map((gradeRange) => (
              <AppGradeBadge key={`${app.id}:${gradeRange}`} gradeRange={gradeRange} />
            ))}
            {app.tags.map((tag) => (
              <Badge key={`${app.id}:${tag}`} variant="outline" radius="xl" color="gray">
                {tag}
              </Badge>
            ))}
          </Flex>

          <div className="rounded-[1.75rem] border border-white/12 bg-white/6 p-6 backdrop-blur-sm">
            <Stack gap="sm">
              <Title order={3} c="white">
                Local embed harness
              </Title>
              <Text c="rgba(255,255,255,0.76)">
                This route exists so the Apps workspace can be exercised end-to-end during local development or while
                an approved embed target is still being finalized.
              </Text>
              <Text c="rgba(255,255,255,0.66)">
                The runtime source of truth is <code>src/renderer/data/approvedApps.ts</code>. Point an app&apos;s
                <code>launchUrl</code> here only when you intentionally want a local preview surface instead of the
                vendor launch target.
              </Text>
            </Stack>
          </div>
        </Stack>
      </Container>
    </Box>
  )
}
