import platform from '@/platform'
import { uploadFile } from '../../../shared/request/request'
import { getAfetch, getAPIOrigin, getChatboxHeaders, log } from './core'

export async function generateUploadUrl(params: { licenseKey: string; filename: string }) {
  type Response = {
    data: {
      url: string
      filename: string
    }
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/files/generate-upload-url`,
    {
      method: 'POST',
      headers: {
        Authorization: params.licenseKey,
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify(params),
    },
    { parseChatboxRemoteError: true }
  )

  const json: Response = await res.json()
  return json.data
}

export async function createUserFile<T extends boolean>(params: {
  licenseKey: string
  filename: string
  filetype: string
  returnContent: T
}) {
  type Response = {
    data: {
      uuid: string
      content: T extends true ? string : undefined
    }
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/files/create`,
    {
      method: 'POST',
      headers: {
        Authorization: params.licenseKey,
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify(params),
    },
    { parseChatboxRemoteError: true }
  )

  const json: Response = await res.json()
  return json.data
}

export async function uploadAndCreateUserFile(licenseKey: string, file: File) {
  const { url, filename } = await generateUploadUrl({
    licenseKey,
    filename: file.name,
  })

  log.debug(`Uploading user file to URL: ${url}`)
  await uploadFile(file, url)
  log.debug(`Uploaded user file: ${file.name}`)

  const result = await createUserFile({
    licenseKey,
    filename,
    filetype: file.type,
    returnContent: true,
  })

  log.debug(`Created user file with UUID: ${result.uuid}`)
  const storageKey = `parseFile-${file.name}_${result.uuid}.${file.type.split('/')[1]}.txt`

  await platform.setStoreBlob(storageKey, result.content)
  return storageKey
}

export async function parseUserLinkPro(params: { licenseKey: string; url: string }) {
  type Response = {
    data: {
      uuid: string
      title: string
      content: string
    }
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/links/parse`,
    {
      method: 'POST',
      headers: {
        Authorization: params.licenseKey,
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify({
        ...params,
        returnContent: true,
      }),
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )

  const json: Response = await res.json()
  const storageKey = `parseUrl-${params.url}_${json.data.uuid}.txt`

  if (json.data.content) {
    await platform.setStoreBlob(storageKey, json.data.content)
  }

  return {
    key: json.data.uuid,
    title: json.data.title,
    storageKey,
  }
}

export async function parseUserLinkFree(params: { url: string }) {
  type Response = {
    title: string
    text: string
  }

  const afetch = await getAfetch()
  const res = await afetch(`https://cors-proxy.chatboxai.app/api/fetch-webpage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const json: Response = await res.json()
  return json
}

export async function webBrowsing(params: { licenseKey: string; query: string }) {
  type Response = {
    data: {
      uuid?: string
      query: string
      links: {
        title: string
        url: string
        content: string
      }[]
    }
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/tool/web-search`,
    {
      method: 'POST',
      headers: {
        Authorization: params.licenseKey,
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

  const json: Response = await res.json()
  return json.data
}

export async function reportContent(params: { id: string; type: string; details: string }) {
  const afetch = await getAfetch()

  await afetch(`${getAPIOrigin()}/api/report_content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getChatboxHeaders()),
    },
    body: JSON.stringify(params),
  })
}
