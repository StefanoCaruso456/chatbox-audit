import { Anchor, Badge, Box, Container, Flex, Stack, Text, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import AppCategoryBadge from '@/components/apps/AppCategoryBadge'
import AppGradeBadge from '@/components/apps/AppGradeBadge'
import AppIcon from '@/components/apps/AppIcon'
import { getApprovedAppById } from '@/data/approvedApps'

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
                Governed library preview
              </Title>
              <Text c="rgba(255,255,255,0.76)">
                This route keeps approved library apps inside the same TutorMeAI app ecosystem as the integrated
                runtimes while a dedicated embedded experience is still being finalized.
              </Text>
              <Text c="rgba(255,255,255,0.66)">
                The sidebar library source of truth is <code>src/renderer/data/approvedApps.ts</code>. This preview
                route lets the app panel, filters, and governance surface stay unified even when the vendor destination
                still needs a richer bridge.
              </Text>
              {app.vendorUrl ? (
                <Text c="rgba(255,255,255,0.72)">
                  Vendor destination:{' '}
                  <Anchor href={app.vendorUrl} target="_blank" rel="noreferrer" c="white" underline="always">
                    {app.vendorUrl}
                  </Anchor>
                </Text>
              ) : null}
            </Stack>
          </div>
        </Stack>
      </Container>
    </Box>
  )
}
