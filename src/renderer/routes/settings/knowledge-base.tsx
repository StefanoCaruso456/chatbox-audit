import { createFileRoute } from '@tanstack/react-router'
import FeatureUnavailableNotice from '@/components/common/FeatureUnavailableNotice'
import KnowledgeBasePage from '@/components/knowledge-base/KnowledgeBase'
import platform from '@/platform'

export const Route = createFileRoute('/settings/knowledge-base')({
  component: KnowledgeBasePageRoute,
})

export function KnowledgeBasePageRoute() {
  if (!platform.capabilities.knowledgeBase) {
    return <FeatureUnavailableNotice title="Knowledge Base" />
  }

  return <KnowledgeBasePage />
}
