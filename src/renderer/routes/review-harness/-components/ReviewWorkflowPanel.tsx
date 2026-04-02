import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import type { AppAgeRating, AppDataAccessLevel } from '@shared/contracts/v1'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  AppRemediationItem,
  AppReviewContext,
  RecordReviewerDecisionRequest,
  StartAppReviewRequest,
} from '../../../../../backend/security/types'

const AGE_RATING_OPTIONS: Array<{ value: AppAgeRating; label: string }> = [
  { value: 'all-ages', label: 'all-ages' },
  { value: '13+', label: '13+' },
  { value: '16+', label: '16+' },
  { value: '18+', label: '18+' },
]

const DATA_ACCESS_OPTIONS: Array<{ value: AppDataAccessLevel; label: string }> = [
  { value: 'minimal', label: 'minimal' },
  { value: 'moderate', label: 'moderate' },
  { value: 'sensitive', label: 'sensitive' },
]

const ACTION_LABELS = {
  'approve-staging': 'Approve staging',
  'approve-production': 'Approve production',
  'request-remediation': 'Request remediation',
  reject: 'Reject',
  suspend: 'Suspend',
} as const

type ReviewDecisionAction = keyof typeof ACTION_LABELS

const DEFAULT_REMEDIATION_ITEM: AppRemediationItem = {
  code: '',
  summary: '',
  recommendation: '',
  field: '',
  blocking: true,
}

type RemediationDraft = AppRemediationItem & {
  draftId: string
}

function createRemediationDraft(): RemediationDraft {
  return {
    draftId: `remediation.${Math.random().toString(36).slice(2, 10)}`,
    ...DEFAULT_REMEDIATION_ITEM,
  }
}

function getAvailableActions(reviewState: string | undefined): ReviewDecisionAction[] {
  if (reviewState === 'review-pending') {
    return ['approve-staging', 'approve-production', 'request-remediation', 'reject']
  }

  if (reviewState === 'approved-staging') {
    return ['approve-production', 'request-remediation', 'reject', 'suspend']
  }

  if (reviewState === 'approved-production') {
    return ['suspend']
  }

  return []
}

export interface ReviewWorkflowPanelProps {
  reviewContext?: AppReviewContext | null
  loading?: boolean
  submitting?: boolean
  defaultReviewerUserId?: string
  errorMessage?: string | null
  onStartReview: (request: StartAppReviewRequest) => Promise<void> | void
  onRecordDecision: (request: RecordReviewerDecisionRequest) => Promise<void> | void
}

export function ReviewWorkflowPanel({
  reviewContext,
  loading = false,
  submitting = false,
  defaultReviewerUserId,
  errorMessage,
  onStartReview,
  onRecordDecision,
}: ReviewWorkflowPanelProps) {
  const app = reviewContext?.app
  const currentVersion = app?.currentVersion
  const currentReview = currentVersion?.review
  const reviewState = currentReview?.reviewState
  const availableActions = useMemo(() => getAvailableActions(reviewState), [reviewState])

  const [reviewerUserId, setReviewerUserId] = useState(defaultReviewerUserId ?? '')
  const [startNotes, setStartNotes] = useState('')
  const [action, setAction] = useState<ReviewDecisionAction | null>(null)
  const [decisionSummary, setDecisionSummary] = useState('')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [ageRating, setAgeRating] = useState<AppAgeRating>('all-ages')
  const [dataAccessLevel, setDataAccessLevel] = useState<AppDataAccessLevel>('minimal')
  const [permissionsSnapshot, setPermissionsSnapshot] = useState<string[]>([])
  const [remediationItems, setRemediationItems] = useState<RemediationDraft[]>([])

  useEffect(() => {
    setReviewerUserId(defaultReviewerUserId ?? '')
  }, [defaultReviewerUserId])

  useEffect(() => {
    if (!currentVersion) {
      setAction(null)
      setDecisionSummary('')
      setDecisionNotes('')
      setAgeRating('all-ages')
      setDataAccessLevel('minimal')
      setPermissionsSnapshot([])
      setRemediationItems([])
      return
    }

    setAction(availableActions[0] ?? null)
    setDecisionSummary('')
    setDecisionNotes(currentReview?.reviewerNotes ?? '')
    setAgeRating(currentVersion.manifest.safetyMetadata.ageRating)
    setDataAccessLevel(currentVersion.manifest.safetyMetadata.dataAccessLevel)
    setPermissionsSnapshot([...currentVersion.manifest.permissions])
    setRemediationItems([])
  }, [availableActions, currentReview?.reviewerNotes, currentVersion])

  const remediationReviews = useMemo(() => {
    return (reviewContext?.reviews ?? []).filter((review) => (review.remediationItems?.length ?? 0) > 0)
  }, [reviewContext?.reviews])

  const canStartReview = reviewState === 'submitted' || reviewState === 'suspended'
  const requiresRemediation = action === 'request-remediation'

  return (
    <Paper withBorder p="md">
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={5}>Reviewer workflow</Title>
          <Text size="sm" c="dimmed">
            Human reviewers start review, record approval decisions, and send structured remediation back to submitters.
          </Text>
        </Stack>

        {errorMessage ? (
          <Alert color="red" title="Reviewer action failed">
            <Text size="sm">{errorMessage}</Text>
          </Alert>
        ) : null}

        {loading ? (
          <Text size="sm" c="dimmed">
            Loading review context…
          </Text>
        ) : null}

        {app ? (
          <Stack gap="xs">
            <Group gap="xs">
              <Badge variant="light" color="blue">
                {app.reviewState}
              </Badge>
              <Badge
                variant="light"
                color={app.reviewStatus === 'approved' ? 'teal' : app.reviewStatus === 'blocked' ? 'red' : 'yellow'}
              >
                {app.reviewStatus}
              </Badge>
            </Group>
            <Text size="sm">
              <strong>Current version:</strong> <Code>{currentVersion?.appVersionId ?? app.currentVersionId}</Code>
            </Text>
            <Text size="sm">
              <strong>Distribution:</strong> {app.distribution}
            </Text>
            <Text size="sm">
              <strong>Auth:</strong> {app.authType}
            </Text>
          </Stack>
        ) : (
          <Alert color="yellow" title="No review context">
            <Text size="sm">
              Open the harness from the reviewer queue to attach a registered app version to this review session.
            </Text>
          </Alert>
        )}

        <Divider />

        <TextInput
          label="Reviewer user ID"
          value={reviewerUserId}
          onChange={(event) => setReviewerUserId(event.currentTarget.value)}
          placeholder="reviewer.platform"
        />

        {canStartReview ? (
          <Stack gap="xs">
            <Textarea
              label="Start review notes"
              placeholder="Summarize what evidence or artifacts the reviewer is starting from."
              value={startNotes}
              autosize
              minRows={2}
              onChange={(event) => setStartNotes(event.currentTarget.value)}
            />
            <Button
              onClick={() => {
                if (!app || !reviewerUserId.trim()) {
                  return
                }

                void onStartReview({
                  appId: app.appId,
                  appVersionId: currentVersion?.appVersionId,
                  reviewedByUserId: reviewerUserId.trim(),
                  notes: startNotes.trim() || undefined,
                })
              }}
              loading={submitting}
              disabled={!app || !reviewerUserId.trim()}
            >
              Start review
            </Button>
          </Stack>
        ) : null}

        {availableActions.length > 0 ? (
          <Stack gap="md">
            <Select
              label="Decision action"
              data={availableActions.map((value) => ({ value, label: ACTION_LABELS[value] }))}
              value={action}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              onChange={(value) => setAction((value as ReviewDecisionAction | null) ?? null)}
            />

            <Textarea
              label="Decision summary"
              placeholder="Summarize the reviewer decision clearly."
              value={decisionSummary}
              autosize
              minRows={2}
              onChange={(event) => setDecisionSummary(event.currentTarget.value)}
            />

            <Textarea
              label="Detailed notes"
              placeholder="Optional notes for reviewer history."
              value={decisionNotes}
              autosize
              minRows={3}
              onChange={(event) => setDecisionNotes(event.currentTarget.value)}
            />

            <Group grow align="flex-start">
              <Select
                label="Age rating"
                data={AGE_RATING_OPTIONS}
                value={ageRating}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                onChange={(value) => {
                  if (value) {
                    setAgeRating(value as AppAgeRating)
                  }
                }}
              />
              <Select
                label="Data access level"
                data={DATA_ACCESS_OPTIONS}
                value={dataAccessLevel}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                onChange={(value) => {
                  if (value) {
                    setDataAccessLevel(value as AppDataAccessLevel)
                  }
                }}
              />
            </Group>

            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Permissions snapshot
              </Text>
              {permissionsSnapshot.length > 0 ? (
                <Group gap="xs">
                  {permissionsSnapshot.map((permission) => (
                    <Badge key={permission} variant="outline" color="gray">
                      {permission}
                    </Badge>
                  ))}
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  No permissions declared for this app version.
                </Text>
              )}
            </Stack>

            {requiresRemediation ? (
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={500}>
                    Remediation items
                  </Text>
                  <Button
                    variant="subtle"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setRemediationItems((current) => [...current, createRemediationDraft()])}
                  >
                    Add item
                  </Button>
                </Group>

                {remediationItems.length === 0 ? (
                  <Alert color="yellow" title="Remediation required">
                    <Text size="sm">Add at least one remediation item so the submitter has a concrete fix list.</Text>
                  </Alert>
                ) : null}

                {remediationItems.map((item, index) => (
                  <Paper key={item.draftId} withBorder p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between" align="center">
                        <Text size="sm" fw={500}>
                          Item {index + 1}
                        </Text>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() =>
                            setRemediationItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                      <TextInput
                        label="Code"
                        value={item.code}
                        onChange={(event) =>
                          setRemediationItems((current) =>
                            current.map((candidate, itemIndex) =>
                              itemIndex === index ? { ...candidate, code: event.currentTarget.value } : candidate
                            )
                          )
                        }
                      />
                      <TextInput
                        label="Field"
                        value={item.field ?? ''}
                        onChange={(event) =>
                          setRemediationItems((current) =>
                            current.map((candidate, itemIndex) =>
                              itemIndex === index ? { ...candidate, field: event.currentTarget.value } : candidate
                            )
                          )
                        }
                      />
                      <Textarea
                        label="Summary"
                        value={item.summary}
                        autosize
                        minRows={2}
                        onChange={(event) =>
                          setRemediationItems((current) =>
                            current.map((candidate, itemIndex) =>
                              itemIndex === index ? { ...candidate, summary: event.currentTarget.value } : candidate
                            )
                          )
                        }
                      />
                      <Textarea
                        label="Recommendation"
                        value={item.recommendation ?? ''}
                        autosize
                        minRows={2}
                        onChange={(event) =>
                          setRemediationItems((current) =>
                            current.map((candidate, itemIndex) =>
                              itemIndex === index
                                ? { ...candidate, recommendation: event.currentTarget.value }
                                : candidate
                            )
                          )
                        }
                      />
                      <Checkbox
                        label="Blocking"
                        checked={item.blocking}
                        onChange={(event) =>
                          setRemediationItems((current) =>
                            current.map((candidate, itemIndex) =>
                              itemIndex === index ? { ...candidate, blocking: event.currentTarget.checked } : candidate
                            )
                          )
                        }
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : null}

            <Button
              onClick={() => {
                if (!app || !currentVersion || !action || !reviewerUserId.trim() || !decisionSummary.trim()) {
                  return
                }

                void onRecordDecision({
                  appId: app.appId,
                  appVersionId: currentVersion.appVersionId,
                  reviewedByUserId: reviewerUserId.trim(),
                  action,
                  decisionSummary: decisionSummary.trim(),
                  notes: decisionNotes.trim() || undefined,
                  ageRating,
                  dataAccessLevel,
                  permissionsSnapshot,
                  remediationItems: requiresRemediation
                    ? remediationItems
                        .filter((item) => item.code && item.summary)
                        .map(({ draftId: _draftId, ...item }) => item)
                    : undefined,
                })
              }}
              loading={submitting}
              disabled={
                !app ||
                !currentVersion ||
                !action ||
                !reviewerUserId.trim() ||
                !decisionSummary.trim() ||
                (requiresRemediation && remediationItems.filter((item) => item.code && item.summary).length === 0)
              }
            >
              Save reviewer decision
            </Button>
          </Stack>
        ) : null}

        {remediationReviews.length > 0 ? (
          <>
            <Divider />
            <Stack gap="sm">
              <Title order={6}>Remediation history</Title>
              {remediationReviews.map((review) => (
                <Paper key={review.appReviewRecordId} withBorder p="sm">
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Badge variant="light" color="yellow">
                        {review.decisionAction}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {review.decidedAt ?? review.createdAt}
                      </Text>
                    </Group>
                    <Text size="sm" fw={500}>
                      {review.decisionSummary ?? 'Remediation requested'}
                    </Text>
                    {(review.remediationItems ?? []).map((item) => (
                      <Stack key={`${review.appReviewRecordId}.${item.code}.${item.summary}`} gap={2}>
                        <Text size="sm">
                          <strong>{item.code}</strong> {item.summary}
                        </Text>
                        {item.recommendation ? (
                          <Text size="xs" c="dimmed">
                            {item.recommendation}
                          </Text>
                        ) : null}
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </>
        ) : null}
      </Stack>
    </Paper>
  )
}
