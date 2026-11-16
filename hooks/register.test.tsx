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

test('Organize rewrites the draft in the box and Undo restores it', async ($, on) => {
  let box = MESSY
  let asked = ''

  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('clock.now', () => ({ value: 0 }))
  on('model.complete', (_, e) => {
    asked = e.prompt

    return { value: { isAnswered: true, text: CLEAN, usage: USAGE } }
  })
  on('prompt.fill', (_, e) => {
    box = e.text

    return { isFilled: true }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    box = MESSY
    asked = ''

    const ui = await $.ui.mount({ ...BAND, surface })

    await ui.press({ key: 'organize' })
    expect(asked).toContain(MESSY)
    expect(box).toBe(CLEAN)
    expect(await ui.find({ type: 'Text', text: /Organized with Opus 5\.5/ })).toBeTruthy()

    // Show original puts the draft as typed under the buttons.
    await ui.press({ key: 'compare' })
    expect((await ui.find({ type: 'Text', text: /fix login/ }))?.text).toBe(MESSY)

    await ui.press({ key: 'undo' })
    expect(box).toBe(MESSY)
    expect(await ui.find({ type: 'Text', text: /original draft is back/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('an empty draft asks the model nothing', async ($, on) => {
  let calls = 0

  on('prompt.read', () => ({ value: { text: '   ', cursor: 0 } }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('clock.now', () => ({ value: 0 }))
  on('model.complete', () => {
    calls += 1

    return { value: { isAnswered: true, text: CLEAN, usage: USAGE } }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'organize' })
  expect(calls).toBe(0)
  expect(await ui.find({ type: 'Text', text: /Type your draft/ })).toBeTruthy()
  await ui.unmount()
})

test('a failed rewrite leaves the draft alone', async ($, on) => {
  let box = MESSY

  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('clock.now', () => ({ value: 0 }))
  on('model.complete', () => ({
    value: { isAnswered: false, reason: 'empty-reply', usage: USAGE },
  }))
  on('prompt.fill', (_, e) => {
    box = e.text

    return { isFilled: true }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'organize' })
  expect(box).toBe(MESSY)
  // The reason stays in the band until the next action.
  expect(await ui.find({ type: 'Text', text: /Could not organize/ })).toBeTruthy()
  await ui.unmount()
})

test('settings.json picks the model, and a bad field falls back', async ($, on) => {
  let sent: { model?: string; effort?: string; timeoutMs?: number } = {}
  const toasts: string[] = []

  on('fs.exists', () => ({ value: true }))
  on('clock.now', () => ({ value: 0 }))
  on('fs.read', () => ({
    value: JSON.stringify({ model: 'Sonnet 5.5', effort: 'turbo', timeoutSeconds: 30 }),
  }))
  on('prompt.read', () => ({ value: { text: MESSY, cursor: MESSY.length } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('model.complete', (_, e) => {
    sent = e

    return { value: { isAnswered: true, text: CLEAN, usage: USAGE } }
  })
  on('prompt.fill', () => ({ isFilled: true }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'organize' })
  expect(sent.model).toBe('claude-sonnet-5-5')
  expect(sent.effort).toBe('medium')
  expect(sent.timeoutMs).toBe(30000)
  expect(toasts.some(text => text.includes('effort'))).toBe(true)
  await ui.unmount()
})

test('with no settings file the rewrite runs on Opus 5.5 at medium effort', async ($, on) => {
  let sent: { model?: string; effort?: string } = {}

  on('fs.exists', () => ({ value: false }))
  on('clock.now', () => ({ value: 0 }))
  on('prompt.read', () => ({ value: { text: MESSY, cursor: MESSY.length } }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.complete', (_, e) => {
    sent = e

    return { value: { isAnswered: true, text: CLEAN, usage: USAGE } }
  })
  on('prompt.fill', () => ({ isFilled: true }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'organize' })
  expect(sent.model).toBe('claude-opus-5-5')
  expect(sent.effort).toBe('medium')
  await ui.unmount()
})

test('the band counts the questions the rewrite ends with', async ($, on) => {
  const withGaps = `${CLEAN}

Unclear - ask me before assuming:
1. Which login?
2. How slow?`

  on('fs.exists', () => ({ value: false }))
  on('clock.now', () => ({ value: 0 }))
  on('prompt.read', () => ({ value: { text: MESSY, cursor: MESSY.length } }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: withGaps, usage: USAGE },
  }))
  on('prompt.fill', () => ({ isFilled: true }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'organize' })
  expect(await ui.find({ type: 'Text', text: /2 questions for you/ })).toBeTruthy()
  await ui.unmount()
})

// The engine's bottom of the prompt.submit chain: the prompt enters as sent.
const ENTER = { kind: 'composer' } as const

test('a new session\'s first message is organized into the box, not sent', async ($, on) => {
  let box = ''
  const entered: string[] = []

  on('fs.exists', () => ({ value: false }))
  on('clock.now', () => ({ value: 0 }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('fs.write', () => ({ value: undefined }))
  on('session.turns', () => ({ value: entered.length }))
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: CLEAN, usage: USAGE },
  }))
  on('prompt.fill', (_, e) => {
    box = e.text

    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    entered.push(e.text)

    return { text: e.text }
  })

  const first = await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })

  expect(first.drop).toContain('review it in the box')
  expect(entered).toEqual([])
  expect(box).toBe(CLEAN)

  // The reviewed rewrite, sent with Enter, goes through.
  const second = await $.prompt.submit({ text: box, wait: false, origin: ENTER })

  expect(second.drop).toBeUndefined()
  expect(entered).toEqual([CLEAN])
})

test('with no prompt box the first message goes through with no model call', async ($, on) => {
  let calls = 0
  const entered: string[] = []

  on('fs.exists', () => ({ value: false }))
  on('clock.now', () => ({ value: 0 }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('fs.write', () => ({ value: undefined }))
  on('session.turns', () => ({ value: 0 }))
  on('prompt.fill', () => ({ isFilled: false, refusal: 'no_composer' }))
  on('model.complete', () => {
    calls += 1

    return { value: { isAnswered: true, text: CLEAN, usage: USAGE } }
  })
  on('prompt.submit', (_, e) => {
    entered.push(e.text)

    return { text: e.text }
  })

  await $.prompt.submit({ text: MESSY, wait: false, origin: { kind: 'sdk' } })
  expect(calls).toBe(0)
  expect(entered).toEqual([MESSY])
})

test('organizeFirstPrompt false sends the first message as typed', async ($, on) => {
  const entered: string[] = []

  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: JSON.stringify({ organizeFirstPrompt: false }) }))
  on('clock.now', () => ({ value: 0 }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('fs.write', () => ({ value: undefined }))
  on('session.turns', () => ({ value: 0 }))
  on('prompt.submit', (_, e) => {
    entered.push(e.text)

    return { text: e.text }
  })

  await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })
  expect(entered).toEqual([MESSY])
})

test('a resumed session\'s next message is not caught', async ($, on) => {
  const entered: string[] = []

  on('fs.exists', () => ({ value: false }))
  on('clock.now', () => ({ value: 0 }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('fs.write', () => ({ value: undefined }))
  on('session.turns', () => ({ value: 4 }))
  on('prompt.submit', (_, e) => {
    entered.push(e.text)

    return { text: e.text }
  })

  await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })
  expect(entered).toEqual([MESSY])
})

test('a desktop app whose box attaches late still gets the rewrite', async ($, on) => {
  let box = ''
  let fills = 0
  const entered: string[] = []

  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }))
  on('clock.sleep', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.surfaces', () => ({ value: [] }))
  on('session.turns', () => ({ value: 0 }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: CLEAN, usage: USAGE },
  }))
  // The first two fills land before the app has bound its box.
  on('prompt.fill', (_, e) => {
    fills += 1

    if (fills <= 2) {
      return { isFilled: false, refusal: 'no_composer' }
    }

    box = e.text

    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => {
    entered.push(e.text)

    return { text: e.text }
  })

  const first = await $.prompt.submit({ text: MESSY, wait: false, origin: ENTER })

  expect(first.drop).toContain('review it in the box')
  expect(entered).toEqual([])
  expect(box).toBe(CLEAN)
})
