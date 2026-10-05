export type CredentialPasterRequest = {
  file: string
  key?: string
  placeholder?: string
  escape?: string
}

declare module 'claude-code' {
  interface PluginState {
    'credential-paster': {
      request: CredentialPasterRequest | null
      typed: number
      error: string | null
    }
  }
}
