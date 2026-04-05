import type { Message } from '@shared/types'

export function getMessageLayoutMeta(message: Pick<Message, 'role'>) {
  const isUserMessage = message.role === 'user'

  return {
    isUserMessage,
    rowDirection: isUserMessage ? 'row-reverse' : 'row',
    rowJustify: isUserMessage ? 'flex-end' : 'flex-start',
    contentAlign: isUserMessage ? 'flex-end' : 'stretch',
    contentMaxWidth: isUserMessage
      ? {
          xs: '85%',
          sm: '70%',
        }
      : undefined,
    bubbleClassName: isUserMessage
      ? 'inline-block max-w-full rounded-lg bg-chatbox-background-secondary px-4'
      : 'inline-block max-w-full w-full',
    attachmentWrapperClassName: isUserMessage ? 'flex w-full justify-end' : '',
    actionsJustify: isUserMessage ? 'flex-end' : 'flex-start',
  } as const
}
