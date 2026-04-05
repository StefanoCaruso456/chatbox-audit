import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import storage, { StorageKey } from '@/storage'

export interface ChatProject {
  id: string
  name: string
  createdAt: number
}

const projectsAtom = atomWithStorage<ChatProject[]>(StorageKey.ChatProjects, [], storage)

function normalizeProjectName(name: string) {
  return name.trim().toLocaleLowerCase()
}

function sortProjects(projects: ChatProject[]) {
  return [...projects].sort((a, b) => b.createdAt - a.createdAt)
}

export function useProjects() {
  const [projects, setProjects] = useAtom(projectsAtom)

  const sortedProjects = useMemo(() => sortProjects(projects), [projects])
  const getProjectById = (projectId?: string | null) => {
    if (!projectId) {
      return undefined
    }

    return sortedProjects.find((project) => project.id === projectId)
  }

  const createProject = (name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('PROJECT_NAME_REQUIRED')
    }

    if (projects.some((project) => normalizeProjectName(project.name) === normalizeProjectName(trimmedName))) {
      throw new Error('PROJECT_NAME_EXISTS')
    }

    const project: ChatProject = {
      id: uuidv4(),
      name: trimmedName,
      createdAt: Date.now(),
    }

    setProjects(async (prev) => {
      const existingProjects = await prev
      return sortProjects([...existingProjects, project])
    })

    return project
  }

  return {
    projects: sortedProjects,
    createProject,
    getProjectById,
  }
}
