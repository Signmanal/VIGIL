import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Radix Select calls scrollIntoView on its items when the content opens; jsdom
// doesn't implement it (nor hasPointerCapture / releasePointerCapture), so stub
// them to let the dropdown open in tests.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.releasePointerCapture = vi.fn()
})

const getGlobalModelInfo = vi.fn()
const getGlobalModelOptions = vi.fn()
const getAuxiliaryModels = vi.fn()
const setModelAssignment = vi.fn()
const getRecommendedDefaultModel = vi.fn()
const setEnvVar = vi.fn()
const getVIGILConfigRecord = vi.fn()
const saveVIGILConfig = vi.fn()
const startManualLocalEndpoint = vi.fn()
const startManualProviderOAuth = vi.fn()

vi.mock('@/vigil', () => ({
  getGlobalModelInfo: () => getGlobalModelInfo(),
  getGlobalModelOptions: () => getGlobalModelOptions(),
  getAuxiliaryModels: () => getAuxiliaryModels(),
  setModelAssignment: (body: unknown) => setModelAssignment(body),
  getRecommendedDefaultModel: (slug: string) => getRecommendedDefaultModel(slug),
  setEnvVar: (key: string, value: string) => setEnvVar(key, value),
  getVIGILConfigRecord: () => getVIGILConfigRecord(),
  saveVIGILConfig: (config: unknown) => saveVIGILConfig(config)
}))

vi.mock('@/store/onboarding', () => ({
  startManualLocalEndpoint: () => startManualLocalEndpoint(),
  startManualProviderOAuth: (slug: string) => startManualProviderOAuth(slug)
}))

beforeEach(() => {
  getGlobalModelInfo.mockResolvedValue({ provider: 'nous', model: 'vigil-4' })
  getGlobalModelOptions.mockResolvedValue({
    providers: [
      {
        name: 'Nous',
        slug: 'nous',
        models: ['vigil-4', 'vigil-4-mini'],
        authenticated: true,
        capabilities: { 'vigil-4': { reasoning: true, fast: true } }
      },
      // An unconfigured api_key provider — surfaced by the full-universe payload.
      { name: 'DeepSeek', slug: 'deepseek', models: [], authenticated: false, auth_type: 'api_key', key_env: 'DEEPSEEK_API_KEY' }
    ]
  })
  getAuxiliaryModels.mockResolvedValue({
    main: { provider: 'nous', model: 'vigil-4' },
    tasks: [{ task: 'vision', provider: 'auto', model: '', base_url: '' }]
  })
  setModelAssignment.mockResolvedValue({ provider: 'nous', model: 'vigil-4', gateway_tools: [] })
  getRecommendedDefaultModel.mockResolvedValue({ provider: 'deepseek', model: 'deepseek-chat', free_tier: null })
  setEnvVar.mockResolvedValue({ ok: true })
  getVIGILConfigRecord.mockResolvedValue({ agent: { reasoning_effort: 'medium', service_tier: 'normal' } })
  saveVIGILConfig.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderModelSettings() {
  const { ModelSettings } = await import('./model-settings')

  return render(<ModelSettings />)
}

describe('ModelSettings', () => {
  it('loads the current main model and lists the full provider universe', async () => {
    await renderModelSettings()

    await waitFor(() => expect(getGlobalModelInfo).toHaveBeenCalled())
    await waitFor(() => expect(getGlobalModelOptions).toHaveBeenCalled())

    // Open the provider Select — every provider from the full payload should be
    // listed, including the unconfigured one with its "set up" hint.
    const triggers = await screen.findAllByRole('combobox')
    fireEvent.click(triggers[0])

    // "Nous" shows in both the trigger and the open list; the unconfigured
    // provider + its setup hint are the unique signal of the full universe.
    expect((await screen.findAllByText('Nous')).length).toBeGreaterThan(0)
    expect(await screen.findByText(/DeepSeek/)).toBeTruthy()
    expect(await screen.findByText(/set up/i)).toBeTruthy()
  })

  it('activates an unconfigured api_key provider inline by saving its key', async () => {
    await renderModelSettings()

    await waitFor(() => expect(getGlobalModelOptions).toHaveBeenCalled())

    // Open the provider Select and pick the unconfigured provider.
    const triggers = screen.getAllByRole('combobox')
    fireEvent.click(triggers[0])
    const deepseekOption = await screen.findByText(/DeepSeek/)
    fireEvent.click(deepseekOption)

    // The inline key input appears for an api_key provider that needs setup.
    const keyInput = await screen.findByPlaceholderText(/Paste DEEPSEEK_API_KEY/)
    fireEvent.change(keyInput, { target: { value: 'sk-test-123' } })

    const activate = await screen.findByRole('button', { name: /Activate/ })
    fireEvent.click(activate)

    await waitFor(() => expect(setEnvVar).toHaveBeenCalledWith('DEEPSEEK_API_KEY', 'sk-test-123'))
  })

  it('does not treat an empty provider row as usable when authentication is unknown', async () => {
    getGlobalModelOptions.mockResolvedValueOnce({
      providers: [
        { name: 'Nous', slug: 'nous', models: ['vigil-4'], authenticated: true },
        { name: 'Mystery Provider', slug: 'mystery', models: [], auth_type: 'oauth' }
      ]
    })

    await renderModelSettings()
    await waitFor(() => expect(getGlobalModelOptions).toHaveBeenCalled())

    const triggers = screen.getAllByRole('combobox')
    fireEvent.click(triggers[0])
    fireEvent.click(await screen.findByText(/Mystery Provider/))

    expect(await screen.findByRole('button', { name: /Set up Mystery Provider/ })).toBeTruthy()
  })

  it('writes the profile default speed (service_tier) when the fast switch is toggled', async () => {
    await renderModelSettings()
    await waitFor(() => expect(getVIGILConfigRecord).toHaveBeenCalled())

    const fastSwitch = await screen.findByRole('switch')
    fireEvent.click(fastSwitch)

    await waitFor(() =>
      expect(saveVIGILConfig).toHaveBeenCalledWith(
        expect.objectContaining({ agent: expect.objectContaining({ service_tier: 'fast' }) })
      )
    )
  })

  it('hides the reasoning/speed defaults when the main model reports no capabilities', async () => {
    getGlobalModelOptions.mockResolvedValueOnce({
      providers: [{ name: 'Nous', slug: 'nous', models: ['vigil-4'], authenticated: true, capabilities: { 'vigil-4': { reasoning: false, fast: false } } }]
    })

    await renderModelSettings()
    await waitFor(() => expect(getVIGILConfigRecord).toHaveBeenCalled())

    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('renders the auxiliary task rows', async () => {
    await renderModelSettings()

    expect(await screen.findByText('Vision')).toBeTruthy()
    expect(screen.getAllByText('auto · use main model').length).toBeGreaterThan(0)
  })

  it('assigns an auxiliary task to the main model via setModelAssignment', async () => {
    await renderModelSettings()

    // One "Set to main" button per task slot; the first is Vision.
    const setToMainButtons = await screen.findAllByRole('button', { name: 'Set to main' })
    fireEvent.click(setToMainButtons[0])

    await waitFor(() =>
      expect(setModelAssignment).toHaveBeenCalledWith({
        model: '',
        provider: 'auto',
        scope: 'auxiliary',
        task: 'vision'
      })
    )
  })

  it('activates an unconfigured api_key provider from an auxiliary model slot', async () => {
    await renderModelSettings()

    const changeButtons = await screen.findAllByRole('button', { name: 'Change' })
    fireEvent.click(changeButtons[0])

    const comboboxes = screen.getAllByRole('combobox')
    const auxProviderSelect = comboboxes.at(-2)
    expect(auxProviderSelect).toBeTruthy()
    fireEvent.click(auxProviderSelect!)

    const deepseekOption = await screen.findByText(/DeepSeek/)
    fireEvent.click(deepseekOption)

    const keyInput = await screen.findByPlaceholderText(/Paste DEEPSEEK_API_KEY/)
    fireEvent.change(keyInput, { target: { value: 'sk-aux-123' } })
    fireEvent.click(await screen.findByRole('button', { name: /Activate/ }))

    await waitFor(() => expect(setEnvVar).toHaveBeenCalledWith('DEEPSEEK_API_KEY', 'sk-aux-123'))
  })

  it('warns when a main switch leaves auxiliary tasks pinned to an unavailable provider', async () => {
    setModelAssignment.mockResolvedValueOnce({
      provider: 'openrouter',
      model: 'anthropic/claude-opus-4.7',
      gateway_tools: [],
      stale_aux: [{ task: 'compression', provider: 'missing-oauth', model: 'vigil-4' }]
    })

    await renderModelSettings()
    await waitFor(() => expect(getGlobalModelInfo).toHaveBeenCalled())

    const applyButton = await screen.findByRole('button', { name: 'Apply' })
    fireEvent.click(applyButton)

    await waitFor(() =>
      expect(setModelAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ confirm_expensive_model: true, scope: 'main' })
      )
    )
    // The switch-time notice only appears when the pinned provider is not ready.
    expect(await screen.findByText(/not connected or configured/)).toBeTruthy()
    expect(screen.getByText(/missing-oauth/)).toBeTruthy()
  })

  it('does not warn when a loaded aux slot uses a connected provider different from the main provider', async () => {
    getGlobalModelOptions.mockResolvedValueOnce({
      providers: [
        { name: 'Nous', slug: 'nous', models: ['vigil-4'], authenticated: true },
        { name: 'xAI Grok', slug: 'xai-oauth', models: ['grok-4.3'], authenticated: true }
      ]
    })
    getAuxiliaryModels.mockResolvedValueOnce({
      main: { provider: 'nous', model: 'vigil-4' },
      tasks: [{ task: 'web_extract', provider: 'xai-oauth', model: 'grok-4.3', base_url: '' }]
    })

    await renderModelSettings()
    await waitFor(() => expect(getAuxiliaryModels).toHaveBeenCalled())

    expect(screen.queryByText(/not connected or configured/)).toBeNull()
    expect(await screen.findByText(/xai-oauth · grok-4.3/)).toBeTruthy()
  })

  it('shows a persistent banner when a loaded aux slot uses an unavailable provider', async () => {
    getAuxiliaryModels.mockResolvedValueOnce({
      main: { provider: 'nous', model: 'vigil-4' },
      tasks: [{ task: 'curator', provider: 'retired-provider', model: 'old-model', base_url: '' }]
    })

    await renderModelSettings()

    expect(await screen.findByText(/not connected or configured/)).toBeTruthy()
    expect(screen.getAllByText(/retired-provider/).length).toBeGreaterThan(0)
  })
})
