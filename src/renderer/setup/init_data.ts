import * as chatStore from '@/stores/chatStore'

export async function initData() {
  await initSessionsIfNeeded()
}

async function initSessionsIfNeeded() {
  // 已经做过 migration，只需要检查是否存在 sessionList
  const sessionList = await chatStore.listSessionsMeta()
  if (sessionList.length > 0) {
    return
  }

  // Presets are selected from conversation settings now, so new installs start with an empty sidebar.
  await chatStore.updateSessionList(() => {
    return []
  })
}
