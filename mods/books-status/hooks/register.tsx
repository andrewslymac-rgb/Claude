import type { Register } from 'claude-code'

// Which business each connector belongs to. QuickBooks matters most: three
// companies, three near-identical connectors.
const BOOKS: [RegExp, string][] = [
  [/^mcp__Intuit_QuickBooks_Labs_061d7fc7__/, 'Adapt Pest Pros'],
  [/^mcp__Intuit_QuickBooks_Labs_3f750f57__/, 'Clever Vending'],
  [/^mcp__Intuit_QuickBooks_Labs__/, 'Lemon and Lavender Cleaning Co.'],
]

const OTHER: [RegExp, string][] = [
  [/^mcp__(Lead_Sprint_Adapt|Orchard_Adapt_Pest_Pros|Orbit)__/, 'Adapt Pest Pros'],
  [/^mcp__(Jobber|Lemon_and_Lavender)__/, 'Lemon and Lavender Cleaning Co.'],
]

// QuickBooks tools that change the books, not just read them.
const QB_WRITE = /__(transactions_(create|update|void|delete|reclassify_lines|send)|accounts_(create|update)|contacts_(create|update)|items_(create|update)|lists_(create|update)|bank_feed_(categorize|create_rule|update_rule|delete_rule|delete_excluded|undo|review)|reconciliation_\w+|recurring_(create|update|delete)|attachments_(upload|delete)|company_(update_info|close_books)|tax_create_\w+)$/

export const register: Register = on => {
  let books: string | undefined
  let business: string | undefined

  const line = (): string | undefined => {
    const parts: string[] = []
    if (books) parts.push(`📒 Books: ${books}`)
    if (business && business !== books) parts.push(`working on: ${business}`)
    return parts.length ? parts.join('  ·  ') : undefined
  }

  on('session.start', ($, e, next) => {
    books = undefined
    business = undefined
    $.ui.status(undefined)
    return next(e)
  })

  on('tool.call', { tool: /^mcp__/ }, async ($, e, next) => {
    const tool = String(e.tool)
    const qb = BOOKS.find(([re]) => re.test(tool))?.[1]
    const other = OTHER.find(([re]) => re.test(tool))?.[1]

    if (qb) {
      const isWrite = QB_WRITE.test(tool)
      if (isWrite && books && books !== qb) {
        $.ui.toast(`Heads up: switching QuickBooks writes from ${books} to ${qb}`, { timeoutMs: 8000 })
      }
      books = qb
      business = qb
      $.ui.status(line())
    } else if (other) {
      business = other
      $.ui.status(line())
    }

    return next(e)
  })
}
