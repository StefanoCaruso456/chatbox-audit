import { describe, expect, it } from 'vitest'
import { getMessageLayoutMeta } from './message-layout'

describe('getMessageLayoutMeta', () => {
  it('right-aligns user messages and constrains their width', () => {
    const layout = getMessageLayoutMeta({ role: 'user' })

    expect(layout.isUserMessage).toBe(true)
    expect(layout.rowDirection).toBe('row-reverse')
    expect(layout.rowJustify).toBe('flex-end')
    expect(layout.contentAlign).toBe('flex-end')
    expect(layout.contentMaxWidth).toEqual({
      xs: '85%',
      sm: '70%',
    })
    expect(layout.bubbleClassName).toContain('bg-chatbox-background-secondary')
    expect(layout.attachmentWrapperClassName).toContain('justify-end')
    expect(layout.actionsJustify).toBe('flex-end')
  })

  it('keeps assistant messages on the normal left-aligned layout', () => {
    const layout = getMessageLayoutMeta({ role: 'assistant' })

    expect(layout.isUserMessage).toBe(false)
    expect(layout.rowDirection).toBe('row')
    expect(layout.rowJustify).toBe('flex-start')
    expect(layout.contentAlign).toBe('stretch')
    expect(layout.contentMaxWidth).toBeUndefined()
    expect(layout.bubbleClassName).toBe('inline-block max-w-full w-full')
    expect(layout.attachmentWrapperClassName).toBe('')
    expect(layout.actionsJustify).toBe('flex-start')
  })
})
