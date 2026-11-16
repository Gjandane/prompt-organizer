export type Phase = 'idle' | 'working'

/** One line the band shows beside its buttons, and how it reads. */
export type Status = { tone: 'ok' | 'error' | 'info'; text: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-organizer': {
      /** Whether a rewrite is running now. */
      phase: Phase
      /** The draft as it was before the last rewrite, for Undo; null when there is none. */
      original: string | null
      /** What the last action came to; null when there is nothing to say. */
      status: Status | null
      /** Whether the original draft is shown under the buttons. */
      isComparing: boolean
      /** The model named in settings.json when it was last read. */
      model: string | null
      /** The toggle as last read from the store: whether first messages are organized. */
      isOn: boolean
      /** Whether this session's first message has been seen, organized or not. */
      isFirstHandled: boolean
    }
  }
}
