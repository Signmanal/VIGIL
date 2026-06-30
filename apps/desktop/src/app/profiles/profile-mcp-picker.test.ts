import { describe, expect, it } from 'vitest'

import { applyMcpSelectionToConfig, enabledMcpServerNames, getMcpServers } from './profile-mcp-picker'

describe('profile MCP selection helpers', () => {
  it('reads enabled MCP server names from a profile config', () => {
    const servers = getMcpServers({
      mcp_servers: {
        disabled: { command: 'node', disabled: true },
        enabled: { command: 'node' },
        remote: { url: 'http://127.0.0.1:7777/mcp' }
      }
    })

    expect(enabledMcpServerNames(servers)).toEqual(['enabled', 'remote'])
  })

  it('keeps only selected MCP servers and enables copied entries', () => {
    const config = {
      mcp_servers: {
        drop: { command: 'drop' },
        keepDisabled: { command: 'node', disabled: true },
        keepEnabled: { command: 'node', env: { TOKEN: 'x' } }
      },
      model: 'xclaw'
    }

    const next = applyMcpSelectionToConfig(config, {
      selected: ['keepDisabled', 'keepEnabled'],
      servers: getMcpServers(config),
      touched: true
    })

    expect(next).toEqual({
      mcp_servers: {
        keepDisabled: { command: 'node' },
        keepEnabled: { command: 'node', env: { TOKEN: 'x' } }
      },
      model: 'xclaw'
    })
  })

  it('removes mcp_servers when the user explicitly selects none', () => {
    const next = applyMcpSelectionToConfig(
      { mcp_servers: { local: { command: 'node' } }, model: 'xclaw' },
      { selected: [], servers: {}, touched: true }
    )

    expect(next).toEqual({ model: 'xclaw' })
  })
})
