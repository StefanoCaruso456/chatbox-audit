import { Badge, Box, Container, Flex, Image, Stack, Text, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { getApprovedAppById } from '@/data/approvedApps'
import AppCategoryBadge from '@/components/apps/AppCategoryBadge'
import AppGradeBadge from '@/components/apps/AppGradeBadge'

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
            Approved Apps Placeholder
          </Badge>

          <Flex align="center" gap="md">
            <Image src={app.icon} alt="" w={64} h={64} radius="xl" />
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
                Ready for live vendor embed
              </Title>
              <Text c="rgba(255,255,255,0.76)">
                This placeholder route keeps the full Apps flow working end-to-end while real vendor launch URLs and
                branded assets are finalized.
              </Text>
              <Text c="rgba(255,255,255,0.66)">
                Replace this app&apos;s <code>launchUrl</code> in <code>src/renderer/data/approvedApps.ts</code> with
                the approved iframe URL when the district-safe embed target is available.
              </Text>
            </Stack>
          </div>
        </Stack>
      </Container>
    </Box>
  )
}
