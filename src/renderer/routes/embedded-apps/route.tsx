import { Box } from '@mantine/core'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/embedded-apps')({
  component: EmbeddedAppsLayout,
})

function EmbeddedAppsLayout() {
  return (
    <Box
      w="100%"
      h="100vh"
      bg="var(--mantine-color-body)"
      style={{
        overflow: 'hidden',
      }}
    >
      <Outlet />
    </Box>
  )
}

export default EmbeddedAppsLayout
