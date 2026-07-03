import { describe, expect, it } from 'vitest'

import type { ChatMessage } from './chat-messages'
import { collectGeneratedPreviewTargetsFromChatMessages } from './chat-artifacts'

const assistant = (parts: ChatMessage['parts']): ChatMessage => ({
  id: crypto.randomUUID(),
  parts,
  role: 'assistant'
})

describe('collectGeneratedPreviewTargetsFromChatMessages', () => {
  it('restores assistant summaries and tool-result artifacts from historical messages', () => {
    const messages: ChatMessage[] = [
      assistant([
        {
          args: {},
          result: {
            artifacts: [
              '/Users/alice/workspace/reports/log_analysis_report.html',
              '/Users/alice/workspace/outputs/evidence-package.json'
            ]
          },
          toolCallId: 'tool-1',
          toolName: 'terminal',
          type: 'tool-call'
        },
        {
          text: '报告已生成：`/Users/alice/workspace/reports/log_analysis_summary.md`',
          type: 'text'
        }
      ])
    ]

    expect(collectGeneratedPreviewTargetsFromChatMessages(messages)).toEqual([
      '/Users/alice/workspace/reports/log_analysis_report.html',
      '/Users/alice/workspace/outputs/evidence-package.json',
      '/Users/alice/workspace/reports/log_analysis_summary.md'
    ])
  })

  it('does not restore read-only reference paths as generated artifacts', () => {
    const messages: ChatMessage[] = [
      assistant([
        {
          args: { path: '/Users/alice/.agents/skills/ueba/references/example.md' },
          result: { content: '/Users/alice/.agents/skills/ueba/references/example.md' },
          toolCallId: 'tool-2',
          toolName: 'read_file',
          type: 'tool-call'
        }
      ])
    ]

    expect(collectGeneratedPreviewTargetsFromChatMessages(messages)).toEqual([])
  })
})
