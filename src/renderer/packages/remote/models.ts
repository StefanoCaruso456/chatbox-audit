import { z } from 'zod'
import { type ModelProvider, ProviderModelInfoSchema } from '../../../shared/types'
import { getAfetch, getAPIOrigin, getChatboxHeaders, log } from './core'

const RemoteModelInfoSchema = z.object({
  modelId: z.string(),
  modelName: z.string(),
  labels: z.array(z.string()).optional(),
  type: z.enum(['chat', 'embedding', 'rerank']).optional(),
  apiStyle: z.enum(['google', 'openai', 'anthropic']).optional(),
  contextWindow: z.number().optional(),
  capabilities: z.array(z.enum(['vision', 'tool_use', 'reasoning'])).optional(),
})

const ModelManifestResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    groupName: z.string(),
    models: z.array(RemoteModelInfoSchema),
  }),
})

const ProviderInfoResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.string(), ProviderModelInfoSchema.nullable()),
})

export async function getModelManifest(params: { aiProvider: ModelProvider; licenseKey?: string; language?: string }) {
  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/model_manifest`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify({
        aiProvider: params.aiProvider,
        licenseKey: params.licenseKey,
        language: params.language,
      }),
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )

  const { success, data, error } = ModelManifestResponseSchema.safeParse(await res.json())
  if (!success) {
    log.error('getModelManifest error', error)
    throw error
  }

  return data.data
}

export async function getProviderModelsInfo(params: { modelIds: string[] }) {
  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/provider_models_info`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify(params),
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )

  const json = ProviderInfoResponseSchema.parse(await res.json())
  return json.data
}
