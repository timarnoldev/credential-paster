import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CredentialPasterRequest } from '../types'

// A hidden paste field inside Claude Code. The model asks for a secret with the
// `request_secret` tool; the person pastes it into a masked field in a pane;
// the value goes straight to the paste-secret script via stdin and never into
// the transcript, the model's context or this plugin's state.

const PANE = 'paste-secret'
const TOOL = 'request_secret'
const BULLET = '•'
const ESCAPES = ['auto', 'none', 'json', 'yaml', 'toml', 'dotenv', 'shell', 'url']
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/
const INPUT_SURFACES = ['terminal', 'desktop', 'vscode']

const request = atom({ plugin: 'credential-paster', key: 'request' } as const, null)
const typed = atom({ plugin: 'credential-paster', key: 'typed' } as const, 0)
const error = atom({ plugin: 'credential-paster', key: 'error' } as const, null)

// The secret lives only in this module's memory until it is written.
let secret = ''

// The field shows bullets; each change is diffed against them so the real
// characters accumulate in `secret` (one contiguous edit per change).
const applyEdit = (shown: string) => {
  if (!shown.includes(BULLET)) {
    secret = shown
    return
  }
  let lead = 0
  while (lead < shown.length && shown[lead] === BULLET) lead++
  let trail = 0
  while (trail < shown.length - lead && shown[shown.length - 1 - trail] === BULLET) trail++
  const inserted = shown.slice(lead, shown.length - trail)
  const keepTrail = Math.min(trail, Math.max(0, secret.length - lead))
  secret = secret.slice(0, lead) + inserted + secret.slice(secret.length - keepTrail)
}

const describe = (r: CredentialPasterRequest) =>
  r.key ? `${r.key} in ${r.file}` : `secret for ${r.file}`

const scriptPath = ($: EngineInterface) =>
  `${$.plugin.root}/skills/credential-paster/scripts/paste-secret`

const scriptArgs = (r: CredentialPasterRequest) =>
  r.placeholder
    ? ['--placeholder', r.placeholder, '--escape', r.escape ?? 'auto', r.file]
    : [r.file, r.key ?? '']

const reset = async ($: EngineInterface) => {
  secret = ''
  await update($, request, () => null)
  await update($, typed, () => 0)
  await update($, error, () => null)
}

const openPane = ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: 'Paste secret', focus: true, closeOnEscape: true, rows: 6 })

const cancel = async ($: EngineInterface, notify: boolean) => {
  const r = await read($, request)
  await reset($)
  if (r && notify) {
    void $.prompt.submit({
      text: `[credential-paster] The user cancelled entering ${describe(r)}. Nothing was written.`,
    })
  }
}

const save = async ($: EngineInterface) => {
  const r = await read($, request)
  if (!r) return
  if (secret.trim() === '') {
    await update($, error, () => 'Nothing pasted yet.')
    return
  }
  const value = secret
  secret = ''
  await update($, typed, () => 0)
  const ran = await $.process.run(['bash', scriptPath($), '--stdin', ...scriptArgs(r)], {
    stdin: value,
  })
  if (ran.exitCode !== 0) {
    await update($, error, () => (ran.stderr.trim() || 'paste-secret failed.') + ' Paste again.')
    return
  }
  await reset($)
  await $.ui.close({ id: PANE })
  $.ui.toast(`Saved ${describe(r)}`)
  void $.prompt.submit({
    text: `[credential-paster] ${ran.stdout.trim()} The user supplied the secret; continue the task. Never read or print it.`,
  })
}

const parseRequest = (input: Record<string, unknown>): CredentialPasterRequest | string => {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : undefined)
  const file = str('file')
  const key = str('key')
  const placeholder = str('placeholder')
  const escape = str('escape')
  if (!file) return '`file` is required.'
  if (!key === !placeholder) return 'Give exactly one of `key` (dotenv) or `placeholder`.'
  if (key && !KEY_RE.test(key)) return `Invalid key name '${key}'.`
  if (placeholder && placeholder.length < 4) return 'Placeholder must be at least 4 characters.'
  if (escape && !ESCAPES.includes(escape)) return `Unknown escape '${escape}'.`
  return { file, key, placeholder, escape }
}

const start = async ($: EngineInterface, r: CredentialPasterRequest): Promise<string | null> => {
  const surfaces = await $.session.surfaces()
  if (!surfaces.some(s => INPUT_SURFACES.includes(s))) {
    return 'No interactive Claude Code UI is attached. Use the paste-secret script from the credential-paster skill instead.'
  }
  if (r.placeholder) {
    const check = await $.process.run(['bash', scriptPath($), '--check', ...scriptArgs(r)])
    if (!check.stdout.startsWith('PENDING')) {
      return `Placeholder not found: ${check.stdout.trim()} Write the placeholder into the file first.`
    }
  }
  secret = ''
  await update($, request, () => r)
  await update($, typed, () => 0)
  await update($, error, () => null)
  await openPane($)
  return null
}

// Tool and command are declared at session start. A plugin installed or
// reloaded into a running session gets no session.start, so the next prompt
// declares them instead. Module variables reset on reload, so this re-runs.
let isRegistered = false

const ensureRegistered = async ($: EngineInterface) => {
  if (isRegistered) return
  try {
    await $.tool.register({
      name: TOOL,
      description:
        'Ask the user for a secret (API key, token, password) through a masked paste field in the Claude Code UI and write it into a file. You never see the value. ' +
        'Dotenv mode: give `file` and `key` (sets KEY=value, creates the file). ' +
        'Any other format: first write a unique placeholder such as __PASTE_SECRET_TOKEN__ into the file, then give `file`, `placeholder` and `escape` ' +
        '(json for JSON/YAML/TOML double-quoted strings, url for URLs, shell, dotenv, none; default auto by file extension). ' +
        'Returns immediately: then END YOUR TURN and tell the user to paste the secret into the field. A message arrives once it is saved or cancelled.',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Target file, relative to the working directory or absolute.' },
          key: { type: 'string', description: 'Dotenv mode: variable name, e.g. OPENAI_API_KEY.' },
          placeholder: { type: 'string', description: 'Placeholder mode: marker already present in the file.' },
          escape: { type: 'string', enum: ESCAPES, description: 'Placeholder mode: how to escape the value.' },
        },
        required: ['file'],
      },
    })
    await $.command.register({
      name: 'paste-secret',
      description: 'Paste a secret into a file through a hidden field (reopens a pending request)',
      argumentHint: '[<file> <KEY>]',
      immediate: true,
    })
    isRegistered = true
  } catch {
    // Session not bound yet: try again at the next event.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await ensureRegistered($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await ensureRegistered($)
    return next(e)
  })

  on('tool.call', { tool: 'mcp__credential-paster__request_secret' }, async ($, e) => {
    const r = parseRequest(e as unknown as Record<string, unknown>)
    if (typeof r === 'string') return { deny: r }
    const failed = await start($, r)
    if (failed) return { deny: failed }
    return {
      result:
        `A masked paste field for ${describe(r)} is open in the user's Claude Code UI. ` +
        'End your turn now and ask the user to paste the secret there and press Enter (they can type /paste-secret to reopen the field). ' +
        'You will get a message when it is saved.',
    }
  })

  on('command.run', { command: 'paste-secret' }, async ($, e) => {
    const [file, key] = e.args.trim().split(/\s+/).filter(Boolean)
    if (file) {
      const r = parseRequest({ file, key })
      if (typeof r === 'string') return { text: `paste-secret: ${r} Usage: /paste-secret <file> <KEY>` }
      const failed = await start($, r)
      return { text: failed ?? `Paste field open for ${describe(r)}.` }
    }
    const r = await read($, request)
    if (!r) return { text: 'No secret requested. Usage: /paste-secret <file> <KEY>' }
    await openPane($)
    return { text: `Paste field open for ${describe(r)}.` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    // Escape or the close mark: treat as cancel. Our own close after saving
    // finds no request left and stays quiet.
    if (e.origin.kind === 'person') await cancel($, true)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>Paste the secret on your computer: the mobile app has no input field.</Text>
    }
    const { Box, Text, Input, Button } = $.ui.resolve(e)
    const r = await read($, request)
    const count = await read($, typed)
    const problem = await read($, error)

    if (!r) {
      return <Text dimColor>No secret requested.</Text>
    }

    return (
      <Box flexDirection="column">
        <Text>
          Paste <Text bold>{describe(r)}</Text>
          <Text dimColor> · hidden from Claude, written directly to the file</Text>
        </Text>
        <Input
          key="secret"
          label="Secret"
          placeholder="paste here, then Enter"
          value={BULLET.repeat(count)}
          submitLabel="save"
          autoFocus
          onInput={value => {
            applyEdit(value)
            void update($, typed, () => secret.length)
            void update($, error, () => null)
          }}
          onSubmit={value => {
            applyEdit(value)
            void save($)
          }}
        />
        <Box>
          <Button key="save" label="Save" variant="primary" onPress={() => void save($)} />
          <Text> </Text>
          <Button key="cancel" label="Cancel" role="dismiss" onPress={async () => { await cancel($, true); await $.ui.close({ id: PANE }) }} />
        </Box>
        {problem && <Text color="red">{problem}</Text>}
      </Box>
    )
  })
}
