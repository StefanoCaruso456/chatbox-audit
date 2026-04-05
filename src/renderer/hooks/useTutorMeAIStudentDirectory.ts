import { useEffect, useMemo, useState } from 'react'
import {
  listTutorMeAIPlatformStudents,
  resolveTutorMeAIBackendOrigin,
  type TutorMeAIPlatformStudent,
} from '@/packages/tutormeai-auth/client'
import { useTutorMeAIAuthStore } from '@/stores/tutorMeAIAuthStore'

export interface TutorMeAIStudentDirectoryOption {
  value: string
  label: string
}

export function useTutorMeAIStudentDirectory(enabled: boolean) {
  const accessToken = useTutorMeAIAuthStore((state) => state.accessToken)
  const status = useTutorMeAIAuthStore((state) => state.status)
  const [students, setStudents] = useState<TutorMeAIPlatformStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backendOrigin = useMemo(() => resolveTutorMeAIBackendOrigin(), [])

  useEffect(() => {
    if (!enabled || status !== 'authenticated' || !accessToken) {
      setStudents([])
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void listTutorMeAIPlatformStudents({
      backendOrigin,
      accessToken,
      signal: controller.signal,
    })
      .then((nextStudents) => {
        if (!controller.signal.aborted) {
          setStudents(nextStudents)
        }
      })
      .catch((directoryError) => {
        if (!controller.signal.aborted) {
          setStudents([])
          setError(directoryError instanceof Error ? directoryError.message : String(directoryError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [accessToken, backendOrigin, enabled, status])

  const options = useMemo<TutorMeAIStudentDirectoryOption[]>(() => {
    return students.map((student) => ({
      value: student.userId,
      label: buildStudentDirectoryLabel(student),
    }))
  }, [students])

  return {
    students,
    options,
    loading,
    error,
  }
}

function buildStudentDirectoryLabel(student: TutorMeAIPlatformStudent) {
  const secondary = student.email ?? student.username ?? student.userId
  return secondary ? `${student.displayName} (${secondary})` : student.displayName
}
