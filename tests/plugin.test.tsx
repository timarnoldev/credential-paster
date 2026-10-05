import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__credential-paster__request_secret'
const PANE = { plugin: 'credential-paster', component: 'Pane', requestId: 'paste-secret' } as const
const PANE_PROPS = { title: 'Paste secret', isFocused: true, bodyColumns: 80, placement: 'inline' } as never

const START = { cwd: '/tmp/project', surface: 'terminal', isInteractive: true } as never

// The engine's registries stand beneath the plugin in a test; answer them.
const start = async ($: { session: { start: (e: never) => Promise<unknown> } }, on: On) => {
  on('tool.register', ($, e) => ({ value: { tool: `mcp__credential-paster__${e.name}` } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start(START)
}

type Run = { argv: readonly string[]; stdin?: string }

// Stands in for the host: a terminal is attached, panes open, the script runs.
const host = (on: On, exitCode = 0) => {
  const runs: Run[] = []
  const prompts: string[] = []
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin })
    const isCheck = e.argv.includes('--check')
    return { value: {
      exitCode: isCheck ? 1 : exitCode,
      stdout: isCheck ? 'PENDING: placeholder found 1 time(s) in config.json' : exitCode === 0 ? 'OK: API_KEY set in .env (mode 600).' : '',
      stderr: exitCode === 0 ? '' : 'paste-secret: directory nope does not exist',
    } } as never
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text } as never
  })
  return { runs, prompts }
}

describe('request_secret', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`masked paste reaches the script via stdin only (${surface})`, async ($, on) => {
      const { runs, prompts } = host(on)
      await start($, on)

      const res = await $.tool.call({ tool: TOOL, file: '.env', key: 'API_KEY' } as never)
      expect(JSON.stringify(res)).toContain('paste field')

      const ui = await $.ui.mount({ ...PANE, surface, props: PANE_PROPS })
      await ui.input({ key: 'secret', text: 'sk-', kind: 'change' })
      expect((await ui.find({ key: 'secret' }))?.text).toBe('•••')
      await ui.input({ key: 'secret', text: '•••abc1', kind: 'change' })
      await ui.input({ key: 'secret', text: '••••••', kind: 'change' }) // backspace
      expect((await ui.find({ key: 'secret' }))?.text).toBe('••••••')
      await ui.input({ key: 'secret', text: '••••••' }) // Enter

      const write = runs.at(-1)
      expect(write?.stdin).toBe('sk-abc')
      expect(write?.argv.slice(-3)).toEqual(['--stdin', '.env', 'API_KEY'])
      expect(write?.argv.join(' ')).not.toContain('sk-abc')
      expect(prompts).toHaveLength(1)
      expect(prompts[0]).toContain('API_KEY set in .env')
      expect(prompts[0]).not.toContain('sk-abc')
      await ui.unmount()
    })
  }

  test('placeholder mode checks the file first and passes escape', async ($, on) => {
    const { runs } = host(on)
    await start($, on)
    await $.tool.call({ tool: TOOL, file: 'config.json', placeholder: '__PASTE_SECRET_X__', escape: 'json' } as never)
    expect(runs[0]?.argv).toContain('--check')

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE_PROPS })
    await ui.input({ key: 'secret', text: 'tok' })
    expect(runs.at(-1)?.argv.slice(-6)).toEqual(['--stdin', '--placeholder', '__PASTE_SECRET_X__', '--escape', 'json', 'config.json'])
    expect(runs.at(-1)?.stdin).toBe('tok')
  })

  test('script errors stay in the pane, nothing reaches the model', async ($, on) => {
    const { prompts } = host(on, 1)
    await start($, on)
    await $.tool.call({ tool: TOOL, file: 'nope/.env', key: 'API_KEY' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE_PROPS })
    await ui.input({ key: 'secret', text: 'secret-value' })
    expect((await ui.find({ type: 'Text', text: /does not exist/ }))).toBeDefined()
    expect(prompts).toHaveLength(0)
  })

  test('cancel tells the model nothing was written', async ($, on) => {
    const { runs, prompts } = host(on)
    await start($, on)
    await $.tool.call({ tool: TOOL, file: '.env', key: 'API_KEY' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE_PROPS })
    await ui.press({ key: 'cancel' })
    expect(runs).toHaveLength(0)
    expect(prompts[0]).toContain('cancelled')
  })

  test('refuses without an interactive UI', async ($, on) => {
    on('session.surfaces', () => ({ value: [] }))
    await start($, on)
    const res = await $.tool.call({ tool: TOOL, file: '.env', key: 'API_KEY' } as never)
    expect(JSON.stringify(res)).toContain('No interactive Claude Code UI')
  })

  test('registers the tool at the next prompt when loaded into a running session', async ($, on) => {
    const registered: string[] = []
    on('tool.register', ($, e) => (registered.push(e.name), { value: { tool: `mcp__credential-paster__${e.name}` } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('prompt.submit', ($, e) => ({ text: e.text }) as never)
    // no session.start: the plugin was installed or reloaded mid-session
    await $.prompt.submit({ text: 'first' } as never)
    await $.prompt.submit({ text: 'second' } as never)
    expect(registered).toEqual(['request_secret'])
  })

  test('rejects bad input', async ($, on) => {
    host(on)
    await start($, on)
    const res = await $.tool.call({ tool: TOOL, file: '.env', key: '1BAD' } as never)
    expect(JSON.stringify(res)).toContain('Invalid key name')
  })
})
