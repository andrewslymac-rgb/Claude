import { expect, test } from 'claude-code/testing'

const reply = (answer: string) => (_: unknown, e: any) => ({
  result: { questions: e.questions, answers: { [e.questions[0].question]: answer } },
})

test('a Quo text waits for Approve, then sends', async ($, on) => {
  let sent = 0
  let asked = ''
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e: any) => {
    asked = e.questions[0].question
    return reply('Approve')(_, e)
  })
  on('tool.call', { tool: 'mcp__Quo__send-message' }, () => {
    sent += 1
    return { result: { ok: true } }
  })
  const r = await $.tool.call({ tool: 'mcp__Quo__send-message', to: ['+15035550100'], content: 'Hi there' } as any)
  expect(asked).toContain('Send a text')
  expect(asked).toContain('Hi there')
  expect(r.deny).toBeUndefined()
  expect(sent).toBe(1)
})

test('Cancel blocks a QuickBooks void', async ($, on) => {
  let ran = 0
  on('tool.call', { tool: 'AskUserQuestion' }, reply('Cancel'))
  on('tool.call', { tool: /transactions_void/ }, () => {
    ran += 1
    return { result: {} }
  })
  const r = await $.tool.call({ tool: 'mcp__Intuit_QuickBooks_Labs_3f750f57__transactions_void', id: '42' } as any)
  expect(r.deny).toContain('cancelled')
  expect(ran).toBe(0)
})

test('reads pass straight through with no question', async ($, on) => {
  let asked = 0
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e: any) => {
    asked += 1
    return reply('Approve')(_, e)
  })
  on('tool.call', { tool: /search_threads/ }, () => ({ result: { threads: [] } }))
  const r = await $.tool.call({ tool: 'mcp__Gmail__search_threads', query: 'x' } as any)
  expect(r.deny).toBeUndefined()
  expect(asked).toBe(0)
})
