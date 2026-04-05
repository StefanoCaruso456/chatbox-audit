/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '@/stores/uiStore'
import ApprovedAppDraftSessionBootstrapController from './ApprovedAppDraftSessionBootstrapController'

describe('ApprovedAppDraftSessionBootstrapController', () => {
  beforeEach(() => {
    uiStore.setState({ activeApprovedAppId: null })
  })

  it('calls the bootstrap callback when a TutorMeAI runtime app opens from the homepage', async () => {
    const onRuntimeAppOpened = vi.fn().mockResolvedValue(undefined)

    render(<ApprovedAppDraftSessionBootstrapController onRuntimeAppOpened={onRuntimeAppOpened} />)

    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    await Promise.resolve()
    expect(onRuntimeAppOpened).toHaveBeenCalledTimes(1)
  })

  it('does not call the bootstrap callback for non-runtime approved apps', async () => {
    const onRuntimeAppOpened = vi.fn().mockResolvedValue(undefined)

    render(<ApprovedAppDraftSessionBootstrapController onRuntimeAppOpened={onRuntimeAppOpened} />)

    uiStore.setState({ activeApprovedAppId: 'duolingo' })

    await Promise.resolve()
    expect(onRuntimeAppOpened).not.toHaveBeenCalled()
  })

  it('does not call the bootstrap callback twice for the same open app id', async () => {
    const onRuntimeAppOpened = vi.fn().mockResolvedValue(undefined)

    render(<ApprovedAppDraftSessionBootstrapController onRuntimeAppOpened={onRuntimeAppOpened} />)

    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })
    uiStore.setState({ activeApprovedAppId: 'chess-tutor' })

    await Promise.resolve()
    expect(onRuntimeAppOpened).toHaveBeenCalledTimes(1)
  })
})
