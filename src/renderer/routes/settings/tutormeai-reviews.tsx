import { Alert, Badge, Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getTrustReviewWorkspace,
  type TrustReviewQueueEntry,
  type TrustReviewQueueState,
} from '@/packages/trust-review'

const REVIEW_STATE_FILTERS = [
  { value: 'all', label: 'All open reviews' },
  { value: 'submitted', label: 'submitted' },
  { value: 'review-pending', label: 'review-pending' },
  { value: 'approved-staging', label: 'approved-staging' },
  { value: 'suspended', label: 'suspended' },
  { value: 'rejected', label: 'rejected' },
] as const

export const Route = createFileRoute('/settings/tutormeai-reviews')({
  component: RouteComponent,
})

function getStatusColor(item: TrustReviewQueueEntry) {
  if (item.reviewState === 'approved-staging') {
    return 'blue'
  }

  if (item.reviewState === 'review-pending') {
    return 'yellow'
  }

  if (item.reviewState === 'submitted') {
    return 'gray'
  }

  if (item.reviewState === 'suspended' || item.reviewState === 'rejected') {
    return 'red'
  }

  return 'gray'
}

export function RouteComponent() {
  const navigate = useNavigate()
  const workspace = useMemo(() => getTrustReviewWorkspace(), [])
  const [queue, setQueue] = useState<TrustReviewQueueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TrustReviewQueueState | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const items = await workspace.listQueue(filter === 'all' ? undefined : filter)
      setQueue(items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load the review queue.')
    } finally {
      setLoading(false)
    }
  }, [filter, workspace])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  return (
    <Stack p="md" gap="xl">
      <Stack gap="xxs">
        <Title order={5}>TutorMeAI Reviews</Title>
        <Text c="chatbox-tertiary" maw={640}>
          Review submitted app versions, open the live harness, and continue human approval decisions from one queue.
        </Text>
      </Stack>

      <Group align="flex-end" justify="space-between">
        <Select
          label="Queue filter"
          data={REVIEW_STATE_FILTERS.map((item) => ({ value: item.value, label: item.label }))}
          value={filter}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(value) => {
            if (value) {
              setFilter(value as (typeof REVIEW_STATE_FILTERS)[number]['value'])
            }
          }}
        />
        <Button variant="default" onClick={() => void loadQueue()} loading={loading}>
          Refresh queue
        </Button>
      </Group>

      {error ? (
        <Alert color="red" title="Queue failed to load">
          <Text size="sm">{error}</Text>
        </Alert>
      ) : null}

      {queue.length === 0 && !loading ? (
        <Alert color="blue" title="No matching review candidates">
          <Text size="sm">There are no review candidates matching the current filter.</Text>
        </Alert>
      ) : null}

      <Stack gap="md">
        {queue.map((item) => (
          <Paper key={item.appVersionId} withBorder p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text fw={600}>{item.name}</Text>
                  <Text size="sm" c="dimmed">
                    {item.slug}
                  </Text>
                </Stack>
                <Group gap="xs">
                  <Badge variant="light" color={getStatusColor(item)}>
                    {item.reviewState}
                  </Badge>
                  <Badge variant="outline" color="gray">
                    {item.launchabilityLabel}
                  </Badge>
                  <Badge variant="outline" color="gray">
                    {item.authType}
                  </Badge>
                </Group>
              </Group>

              <Text size="sm">
                <strong>App version:</strong> {item.appVersionId}
              </Text>
              <Text size="sm">
                <strong>Distribution:</strong> {item.distribution}
              </Text>
              <Text size="sm">
                <strong>Category:</strong> {item.category}
              </Text>
              <Text size="sm">
                <strong>Submitted at:</strong> {item.submittedAt ?? 'unknown'}
              </Text>
              <Text size="sm">
                <strong>Reviewer:</strong> {item.reviewedByUserId ?? 'unassigned'}
              </Text>
              {item.reviewerNotes ? (
                <Text size="sm">
                  <strong>Latest notes:</strong> {item.reviewerNotes}
                </Text>
              ) : null}

              <Group justify="flex-end">
                <Button
                  onClick={() =>
                    navigate({
                      to: '/review-harness',
                      search: item.reviewHarnessSearch,
                    })
                  }
                >
                  Open review harness
                </Button>
              </Group>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  )
}
