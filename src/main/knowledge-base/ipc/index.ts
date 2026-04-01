import { registerKnowledgeBaseFileMutationHandlers } from './file-mutation-handlers'
import { registerKnowledgeBaseFileQueryHandlers } from './file-query-handlers'
import { registerKnowledgeBaseCrudHandlers } from './knowledge-base-handlers'
import { registerKnowledgeBaseParserHandlers } from './parser-handlers'

export function registerKnowledgeBaseHandlers() {
  registerKnowledgeBaseCrudHandlers()
  registerKnowledgeBaseFileQueryHandlers()
  registerKnowledgeBaseFileMutationHandlers()
  registerKnowledgeBaseParserHandlers()
}
