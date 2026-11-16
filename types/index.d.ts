export type Phase = 'idle' | 'working'

declare module 'claude-code' {
  interface PluginState {
    'prompt-organizer': {
      /** Whether a rewrite is running now. */
      phase: Phase
      /** The draft as it was before the last rewrite, for Undo; null when there is none. */
      original: string | null
    }
  }
}
