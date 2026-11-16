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

    await ui.press({ key: 'undo' })
    expect(box).toBe(MESSY)
    await ui.unmount()
  }
})

test('an empty draft asks the model nothing', async ($, on) => {
  let calls = 0

  on('prompt.read', () => ({ value: { text: '   ', cursor: 0 } }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('model.complete', () => {
    calls += 1

    return { value: { isAnswered: true, text: CLEAN, usage: USAGE } }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await ui.press({ key: 'organize' })
  expect(calls).toBe(0)
  await ui.unmount()
})

test('a failed rewrite leaves the draft alone', async ($, on) => {
  let box = MESSY

  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
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
  await ui.unmount()
})

test('settings.json picks the model, and a bad field falls back', async ($, on) => {
  let sent: { model?: string; effort?: string; timeoutMs?: number } = {}
  const toasts: string[] = []

  on('fs.exists', () => ({ value: true }))
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
