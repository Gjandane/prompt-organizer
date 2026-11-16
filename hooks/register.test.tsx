import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'prompt-organizer',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const MESSY = 'fix login also its slow oh and dont touch the db schema'
const CLEAN = 'Fix the login bug and its slowness. Do not change the database schema.'
const USAGE = {
  input_tokens: 1,
  output_tokens: 1,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

// The person's Enter in the app.
const ENTER = { kind: 'composer' } as const

type Stage = {
  /** What the store holds under the toggle's key; unset when left out. */
  isOn?: boolean
  /** The user turns the session already has; the messages entered when left out. */
  turns?: number
  /** settings.json as text; no file when left out. */
  settings?: string
  /** What the model answers; CLEAN when left out. */
  reply?: { isAnswered: true; text: string } | { isAnswered: false; reason: 'empty-reply' }
  /** How many fills the box refuses before it takes one. */
  lateFills?: number
  /** Whether the session has no prompt box at all. */
  isHeadless?: boolean
}

// Every call the mod makes on $, answered as a session would. Registered
// before the first call on $, as the test kit requires.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stage = (on: any, opts: Stage = {}) => {
  const seen = {
    box: '',
    entered: [] as string[],
    store: new Map<string, unknown>(),
    sent: {} as { model?: string; effort?: string; timeoutMs?: number; prompt?: string },
    calls: 0,
    toasts: [] as string[],
  }
  let fills = 0

  if (opts.isOn !== undefined) {
    seen.store.set('isOn', opts.isOn)
  }

  on('store.get', (_: unknown, e: { key: string }) => ({ value: seen.store.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    seen.store.set(e.key, e.value)

    return { value: undefined }
  })
  on('fs.exists', () => ({ value: opts.settings !== undefined }))
  on('fs.read', () => ({ value: opts.settings ?? '' }))
  on('clock.now', () => ({ value: 0 }))
  on('clock.sleep', () => ({ value: undefined }))
  on('ui.toast', (_: unknown, e: { text: string }) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('session.turns', () => ({ value: opts.turns ?? seen.entered.length }))
  on('prompt.read', () => ({ value: { text: seen.box, cursor: seen.box.length } }))
  on('model.complete', (_: unknown, e: typeof seen.sent) => {
    seen.calls += 1
    seen.sent = e

    return { value: { ...(opts.reply ?? { isAnswered: true, text: CLEAN }), usage: USAGE } }
  })
  on('prompt.fill', (_: unknown, e: { text: string }) => {
    fills += 1

    if (opts.isHeadless || fills <= (opts.lateFills ?? 0)) {
      return { isFilled: false, refusal: 'no_composer' }
    }

    seen.box = e.text

    return { isFilled: true }
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    seen.entered.push(e.text)

    return { text: e.text }
  })

  return seen
}

test('the toggle flips between Off and On and is kept in the store', async ($, on) => {
  const seen = stage(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    seen.store.delete('isOn')

    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Button', label: 'Organizer: Off' })).toBeTruthy()
    await ui.press({ key: 'toggle' })
    expect(seen.store.get('isOn')).toBe(true)
    expect(await ui.find({ type: 'Button', label: 'Organizer: On' })).toBeTruthy()
    await ui.press({ key: 'toggle' })
    expect(seen.store.get('isOn')).toBe(false)
    await ui.unmount()
  }
})

test('with the toggle on, the first message is organized into the box, not sent', async ($, on) => {
  const seen = stage(on, { isOn: true })

  const first = await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })

  expect(first.drop).toContain('review it in the box')
  expect(seen.sent.prompt).toContain(MESSY)
  expect(seen.entered).toEqual([])
  expect(seen.box).toBe(CLEAN)

  // Show original and Undo work on the held message.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /Organized with Opus 5\.5/ })).toBeTruthy()
  await ui.press({ key: 'compare' })
  expect((await ui.find({ type: 'Text', text: /fix login/ }))?.text).toBe(MESSY)
  await ui.press({ key: 'undo' })
  expect(seen.box).toBe(MESSY)
  await ui.unmount()

  // The next Enter goes through, whatever is in the box.
  const second = await $.prompt.submit({ text: seen.box, wait: false, origin: ENTER })

  expect(second.drop).toBeUndefined()
  expect(seen.entered).toEqual([MESSY])
})

test('with the toggle off, the first message is sent as typed', async ($, on) => {
  const seen = stage(on)

  await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })
  expect(seen.calls).toBe(0)
  expect(seen.entered).toEqual([MESSY])
})

test('only the first message is caught', async ($, on) => {
  const seen = stage(on, { isOn: true, turns: 4 })

  await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })
  expect(seen.calls).toBe(0)
  expect(seen.entered).toEqual([MESSY])
})

test('with no prompt box the first message goes through with no model call', async ($, on) => {
  const seen = stage(on, { isOn: true, isHeadless: true })

  await $.prompt.submit({ text: MESSY, wait: false, origin: { kind: 'sdk' } })
  expect(seen.calls).toBe(0)
  expect(seen.entered).toEqual([MESSY])
})

test('a desktop app whose box attaches late still gets the rewrite', async ($, on) => {
  const seen = stage(on, { isOn: true, lateFills: 2 })

  const first = await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })

  expect(first.drop).toContain('review it in the box')
  expect(seen.entered).toEqual([])
  expect(seen.box).toBe(CLEAN)
})

test('a failed rewrite holds the message and leaves the draft in the box', async ($, on) => {
  const seen = stage(on, { isOn: true, reply: { isAnswered: false, reason: 'empty-reply' } })

  const first = await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })

  expect(first.drop).toContain('Could not organize')
  expect(seen.box).toBe(MESSY)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /Could not organize/ })).toBeTruthy()
  await ui.unmount()
})

test('settings.json picks the model, and a bad field falls back', async ($, on) => {
  const seen = stage(on, {
    isOn: true,
    settings: JSON.stringify({ model: 'Sonnet 5.5', effort: 'turbo', timeoutSeconds: 30 }),
  })

  await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })
  expect(seen.sent.model).toBe('claude-sonnet-5-5')
  expect(seen.sent.effort).toBe('medium')
  expect(seen.sent.timeoutMs).toBe(30000)
  expect(seen.toasts.some(text => text.includes('effort'))).toBe(true)
})

test('with no settings file the rewrite runs on Opus 5.5 at medium effort', async ($, on) => {
  const seen = stage(on, { isOn: true })

  await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })
  expect(seen.sent.model).toBe('claude-opus-5-5')
  expect(seen.sent.effort).toBe('medium')
})

test('the band counts the questions the rewrite ends with', async ($, on) => {
  stage(on, {
    isOn: true,
    reply: {
      isAnswered: true,
      text: `${CLEAN}\n\nUnclear - ask me before assuming:\n1. Which login?\n2. How slow?`,
    },
  })

  await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /2 questions for you/ })).toBeTruthy()
  await ui.unmount()
})
