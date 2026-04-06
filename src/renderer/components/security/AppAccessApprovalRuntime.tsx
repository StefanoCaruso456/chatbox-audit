import { Alert, Box, Button, Group, Loader, Modal, Paper, Stack, Text, Title } from '@mantine/core'
import { useCallback, useEffect, useMemo } from 'react'
import { getApprovedAppById } from '@/data/approvedApps'
import {
  decideTutorMeAIAppAccessRequest,
  fetchTutorMeAIMyAppAccessRequest,
  listTutorMeAIPendingAppAccessRequests,
  submitTutorMeAIAppAccessRequest,
} from '@/packages/app-access/client'
import { useAppAccessStore } from '@/stores/appAccessStore'
import { useTutorMeAIAuthStore } from '@/stores/tutorMeAIAuthStore'
import { useUIStore } from '@/stores/uiStore'
import type { ApprovedApp } from '@/types/apps'

const POLL_INTERVAL_MS = 2000

function isReviewerRole(role: string | null | undefined) {
  return role === 'teacher' || role === 'school_admin' || role === 'district_Director'
}

function requiresTeacherApproval(app: ApprovedApp | null | undefined) {
  if (!app) {
    return false
  }

  return app.accessPolicy?.requiresTeacherApproval ?? true
}

export default function AppAccessApprovalRuntime() {
  const requestedApprovedAppId = useUIStore((state) => state.requestedApprovedAppId)
  const activeApprovedAppId = useUIStore((state) => state.activeApprovedAppId)
  const completeApprovedAppOpen = useUIStore((state) => state.completeApprovedAppOpen)
  const clearApprovedAppOpenRequest = useUIStore((state) => state.clearApprovedAppOpenRequest)

  const accessToken = useTutorMeAIAuthStore((state) => state.accessToken)
  const user = useTutorMeAIAuthStore((state) => state.user)
  const status = useTutorMeAIAuthStore((state) => state.status)

  const studentRequest = useAppAccessStore((state) => state.studentRequest)
  const teacherPendingRequests = useAppAccessStore((state) => state.teacherPendingRequests)
  const studentSubmittingAppId = useAppAccessStore((state) => state.studentSubmittingAppId)
  const reviewerBusyRequestId = useAppAccessStore((state) => state.reviewerBusyRequestId)
  const error = useAppAccessStore((state) => state.error)
  const setStudentRequest = useAppAccessStore((state) => state.setStudentRequest)
  const setTeacherPendingRequests = useAppAccessStore((state) => state.setTeacherPendingRequests)
  const setStudentSubmittingAppId = useAppAccessStore((state) => state.setStudentSubmittingAppId)
  const setReviewerBusyRequestId = useAppAccessStore((state) => state.setReviewerBusyRequestId)
  const setAppAccessError = useAppAccessStore((state) => state.setAppAccessError)

  useEffect(() => {
    if (!requestedApprovedAppId || status !== 'authenticated' || !accessToken || !user) {
      return
    }

    const app = getApprovedAppById(requestedApprovedAppId)
    if (!app) {
      clearApprovedAppOpenRequest(requestedApprovedAppId)
      return
    }

    if (user.role !== 'student' || !requiresTeacherApproval(app)) {
      if (studentRequest?.appId === app.id) {
        setStudentRequest(null)
      }
      setStudentSubmittingAppId(null)
      setAppAccessError(null)
      completeApprovedAppOpen(app.id)
      return
    }

    let cancelled = false
    setStudentSubmittingAppId(app.id)
    setAppAccessError(null)

    void submitTutorMeAIAppAccessRequest({
      accessToken,
      appId: app.id,
      appName: app.name,
    })
      .then((result) => {
        if (cancelled) {
          return
        }
        setStudentSubmittingAppId(null)
        clearApprovedAppOpenRequest(app.id)
        if (result.access === 'approved') {
          setStudentRequest(null)
          completeApprovedAppOpen(app.id)
          return
        }
        setStudentRequest(result.request)
      })
      .catch((submitError) => {
        if (cancelled) {
          return
        }
        clearApprovedAppOpenRequest(app.id)
        setAppAccessError(submitError instanceof Error ? submitError.message : String(submitError))
      })

    return () => {
      cancelled = true
    }
  }, [
    accessToken,
    clearApprovedAppOpenRequest,
    completeApprovedAppOpen,
    requestedApprovedAppId,
    setAppAccessError,
    setStudentRequest,
    setStudentSubmittingAppId,
    studentRequest?.appId,
    status,
    user,
  ])

  useEffect(() => {
    if (!studentSubmittingAppId) {
      return
    }

    if (studentRequest?.appId === studentSubmittingAppId || activeApprovedAppId === studentSubmittingAppId) {
      setStudentSubmittingAppId(null)
    }
  }, [activeApprovedAppId, setStudentSubmittingAppId, studentRequest?.appId, studentSubmittingAppId])

  useEffect(() => {
    if (!accessToken || user?.role !== 'student' || studentRequest?.status !== 'pending') {
      return
    }

    const app = getApprovedAppById(studentRequest.appId)
    if (!requiresTeacherApproval(app)) {
      return
    }

    let cancelled = false
    const poll = async () => {
      try {
        const latest = await fetchTutorMeAIMyAppAccessRequest({
          accessToken,
          appId: studentRequest.appId,
        })
        if (cancelled || !latest) {
          return
        }
        setStudentSubmittingAppId(null)
        if (latest.status === 'approved') {
          setStudentRequest(null)
          completeApprovedAppOpen(latest.appId)
          return
        }
        setStudentRequest(latest)
      } catch (pollError) {
        if (!cancelled) {
          setAppAccessError(pollError instanceof Error ? pollError.message : String(pollError))
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    accessToken,
    completeApprovedAppOpen,
    setAppAccessError,
    setStudentRequest,
    setStudentSubmittingAppId,
    studentRequest,
    user?.role,
  ])

  useEffect(() => {
    if (!accessToken || !isReviewerRole(user?.role)) {
      setTeacherPendingRequests([])
      return
    }

    let cancelled = false
    const poll = async () => {
      try {
        const requests = await listTutorMeAIPendingAppAccessRequests({
          accessToken,
        })
        if (!cancelled) {
          setTeacherPendingRequests(requests)
        }
      } catch (pollError) {
        if (!cancelled) {
          setAppAccessError(pollError instanceof Error ? pollError.message : String(pollError))
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [accessToken, setAppAccessError, setTeacherPendingRequests, user?.role])

  const handleDecision = useCallback(
    async (requestId: string, nextStatus: 'approved' | 'declined') => {
      if (!accessToken) {
        return
      }

      try {
        setReviewerBusyRequestId(requestId)
        setAppAccessError(null)
        await decideTutorMeAIAppAccessRequest({
          accessToken,
          appAccessRequestId: requestId,
          status: nextStatus,
        })
        setTeacherPendingRequests(teacherPendingRequests.filter((request) => request.appAccessRequestId !== requestId))
      } catch (decisionError) {
        setAppAccessError(decisionError instanceof Error ? decisionError.message : String(decisionError))
      } finally {
        setReviewerBusyRequestId(null)
      }
    },
    [accessToken, setAppAccessError, setReviewerBusyRequestId, setTeacherPendingRequests, teacherPendingRequests]
  )

  const activeTeacherRequest =
    teacherPendingRequests.find((request) => requiresTeacherApproval(getApprovedAppById(request.appId))) ?? null
  const studentRequestRequiresApproval = requiresTeacherApproval(
    studentRequest ? getApprovedAppById(studentRequest.appId) : undefined
  )
  const studentSubmittingRequiresApproval = requiresTeacherApproval(
    studentSubmittingAppId ? getApprovedAppById(studentSubmittingAppId) : undefined
  )
  const studentApprovalErrorVisible =
    Boolean(error) && !studentRequest && Boolean(studentSubmittingAppId) && studentSubmittingRequiresApproval
  const studentApprovalModalOpen =
    (Boolean(studentRequest) && studentRequestRequiresApproval) ||
    (Boolean(studentSubmittingAppId) && studentSubmittingRequiresApproval)
  const canDismissStudentModal = studentRequest?.status === 'declined' || studentApprovalErrorVisible
  const studentWaitingTitle = useMemo(() => {
    if (!studentApprovalModalOpen) {
      return ''
    }
    if (studentRequest?.status === 'declined') {
      return `${studentRequest.appName} was declined`
    }
    if (studentApprovalErrorVisible && studentSubmittingAppId) {
      const app = getApprovedAppById(studentSubmittingAppId)
      return app ? `Unable to request ${app.name}` : 'Unable to request app approval'
    }
    if (studentRequest) {
      return `Waiting for teacher approval`
    }
    if (studentSubmittingAppId) {
      const app = getApprovedAppById(studentSubmittingAppId)
      return app ? `Requesting ${app.name}` : 'Requesting app approval'
    }
    return ''
  }, [studentApprovalErrorVisible, studentApprovalModalOpen, studentRequest, studentSubmittingAppId])

  return (
    <>
      <Modal
        opened={studentApprovalModalOpen}
        onClose={() => {
          if (studentRequest?.status === 'declined') {
            setStudentRequest(null)
          }
          if (studentApprovalErrorVisible) {
            setStudentSubmittingAppId(null)
            setAppAccessError(null)
          }
        }}
        withCloseButton={canDismissStudentModal}
        closeOnClickOutside={canDismissStudentModal}
        closeOnEscape={canDismissStudentModal}
        centered
        size="md"
        title={studentWaitingTitle}
      >
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}

          {studentSubmittingAppId && !studentApprovalErrorVisible ? (
            <Group>
              <Loader size="sm" />
              <Text size="sm">Sending your app request to the teacher approval queue…</Text>
            </Group>
          ) : null}

          {studentRequest?.status === 'pending' ? (
            <Alert color="blue" variant="light">
              {`${studentRequest.appName} is blocked until a teacher approves access for ${studentRequest.studentDisplayName}.`}
            </Alert>
          ) : null}

          {studentRequest?.status === 'declined' ? (
            <Alert color="red" variant="light">
              {studentRequest.decisionReason
                ? studentRequest.decisionReason
                : `A teacher declined access to ${studentRequest.appName}.`}
            </Alert>
          ) : null}

          {studentRequest?.status === 'pending' ? (
            <Text size="sm" c="dimmed">
              Keep this window open. As soon as a teacher approves the request, the modal will disappear and the app
              will open automatically.
            </Text>
          ) : null}

          {studentApprovalErrorVisible ? (
            <Text size="sm" c="dimmed">
              This student account cannot request approval yet. Close this dialog, then make sure a teacher or
              administrator is assigned to the student before trying again.
            </Text>
          ) : null}
        </Stack>
      </Modal>

      {activeTeacherRequest ? (
        <Box
          style={{
            position: 'fixed',
            right: 20,
            bottom: 20,
            zIndex: 400,
            width: 'min(380px, calc(100vw - 32px))',
          }}
        >
          <Paper withBorder shadow="lg" radius="xl" p="md">
            <Stack gap="sm">
              <div>
                <Title order={4} fz="md">
                  Student app approval needed
                </Title>
                <Text size="sm" c="dimmed">
                  {teacherPendingRequests.length > 1
                    ? `${teacherPendingRequests.length} student requests are waiting.`
                    : 'A student is waiting for access right now.'}
                </Text>
              </div>

              {error ? <Alert color="red">{error}</Alert> : null}

              <Stack gap={2}>
                <Text size="sm">
                  <strong>Student:</strong> {activeTeacherRequest.studentDisplayName}
                </Text>
                <Text size="sm">
                  <strong>Student ID:</strong> {activeTeacherRequest.studentUserId}
                </Text>
                <Text size="sm">
                  <strong>Email:</strong> {activeTeacherRequest.studentEmail ?? 'Unavailable'}
                </Text>
                <Text size="sm">
                  <strong>App:</strong> {activeTeacherRequest.appName}
                </Text>
              </Stack>

              <Group justify="flex-end">
                <Button
                  variant="default"
                  color="gray"
                  loading={reviewerBusyRequestId === activeTeacherRequest.appAccessRequestId}
                  onClick={() => void handleDecision(activeTeacherRequest.appAccessRequestId, 'declined')}
                >
                  Decline
                </Button>
                <Button
                  color="chatbox-brand"
                  loading={reviewerBusyRequestId === activeTeacherRequest.appAccessRequestId}
                  onClick={() => void handleDecision(activeTeacherRequest.appAccessRequestId, 'approved')}
                >
                  Approve
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Box>
      ) : null}
    </>
  )
}
