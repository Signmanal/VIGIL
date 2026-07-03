import { collectGeneratedArtifactTargetsFromText, collectGeneratedArtifactTargetsFromToolResult } from './artifact-detection'
import { type ChatMessage, chatMessageText } from './chat-messages'

export function collectGeneratedPreviewTargetsFromChatMessages(messages: readonly ChatMessage[]): string[] {
  const seen = new Set<string>()
  const targets: string[] = []
  const add = (values: string[]) => {
    for (const value of values) {
      if (!seen.has(value)) {
        seen.add(value)
        targets.push(value)
      }
    }
  }

  for (const message of messages) {
    if (message.hidden) {
      continue
    }

    for (const part of message.parts) {
      if (part.type === 'tool-call' && part.result !== undefined) {
        add(collectGeneratedArtifactTargetsFromToolResult(part.result, part.toolName))
      }
    }

    if (message.role === 'assistant') {
      add(collectGeneratedArtifactTargetsFromText(chatMessageText(message)))
    }
  }

  return targets
}
