import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pulse, PulseCard, PulseLine } from '../types'

const PANE = 'business-pulse'
const TITLE = 'Business Pulse'
const REFRESH_MS = 30 * 60 * 1000

// MCP servers, spelled as their tool names spell them.
const LEADSPRINT = 'Lead_Sprint_Adapt'
const WORKSPACE = 'adapt-pest-pros'
const JOBBER = 'Jobber'
const QB_ADAPT = 'Intuit_QuickBooks_Labs_061d7fc7'
const QB_LL = 'Intuit_QuickBooks_Labs'
const QB_VENDING = 'Intuit_QuickBooks_Labs_3f750f57'

const pulse = atom(
  { plugin: 'business-pulse', key: 'pulse' } as const,
  { cards: [], updatedAt: null, isLoading: false } as Pulse,
  { shape: 'pulse-1' },
)

const money = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const whole = Math.round(Math.abs(n))
  return `${sign}$${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

async function callJson($: EngineInterface, server: string, tool: string, args: Record<string, unknown>): Promise<any> {
  const res = await $.mcp.call(server, tool, args)
  if (res.structuredContent && typeof res.structuredContent === 'object') return res.structuredContent
  const block = res.content.find(b => b.type === 'text') as { text?: string } | undefined
  const text = block?.text ?? ''
  if (res.isError) throw new Error(text.slice(0, 120) || `${tool} failed`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${tool}: unreadable reply`)
  }
}

type PnL = { income: number | null; expenses: number | null; net: number | null }

async function pnlMonthToDate($: EngineInterface, server: string): Promise<PnL> {
  const r = await callJson($, server, 'reports_profit_and_loss', { period: { macro: 'ThisMonthToDate' } })
  const rows: any[] = r.totals ?? r.rows ?? []
  const pick = (label: string) => rows.find(x => x.label === label)?.values?.Total ?? null
  return { income: pick('Total Income') ?? 0, expenses: pick('Total Expenses') ?? 0, net: pick('Net Income') }
}

const netLine = (net: number | null): PulseLine => ({
  label: 'Net income MTD',
  value: money(net),
  tone: net === null ? undefined : net < 0 ? 'error' : 'success',
})

async function settle(id: string, title: string, work: () => Promise<PulseLine[]>): Promise<PulseCard> {
  try {
    return { id, title, lines: await work() }
  } catch (err) {
    return { id, title, lines: [], error: err instanceof Error ? err.message : String(err) }
  }
}

async function adaptCard($: EngineInterface): Promise<PulseCard> {
  return settle('adapt', 'Adapt Pest Pros', async () => {
    const [lsa, rev, ar, qb] = await Promise.all([
      callJson($, LEADSPRINT, 'lsa_summary', { workspace: WORKSPACE, period: 'this_month' }),
      callJson($, LEADSPRINT, 'gd_revenue_report', { workspace: WORKSPACE, period: 'this_month' }),
      callJson($, LEADSPRINT, 'gd_ar_aging', { workspace: WORKSPACE }),
      pnlMonthToDate($, QB_ADAPT).catch(() => null),
    ])
    const buckets: any[] = ar.buckets ?? []
    const over60 = buckets
      .filter(b => b.age === '61-90 days' || b.age === 'over 90 days')
      .reduce((sum, b) => sum + (b.owed ?? 0), 0)
    const cpl = lsa.spend?.costPerChargedLead
    const lines: PulseLine[] = [
      { label: 'LSA leads MTD', value: `${lsa.leads ?? 0} (${lsa.chargedLeads ?? 0} charged)` },
      { label: 'LSA spend MTD', value: `${money(lsa.spend?.cost)}${cpl ? ` · ${money(cpl)}/lead` : ''}` },
      { label: 'Billed MTD', value: money(rev.totals?.billed) },
      { label: 'Collected MTD', value: money(rev.totals?.collected) },
      { label: 'A/R owed', value: `${money(ar.totalOwed)} · ${ar.openInvoices ?? 0} invoices` },
      { label: 'A/R over 60 days', value: money(over60), tone: over60 > 0 ? 'warning' : 'success' },
    ]
    if (qb) lines.push(netLine(qb.net))
    return lines
  })
}

async function lemonCard($: EngineInterface): Promise<PulseCard> {
  return settle('lemon', 'Lemon and Lavender Cleaning Co.', async () => {
    const [today, late, quotes, qb] = await Promise.all([
      callJson($, JOBBER, 'search_visits', { status: 'today', limit: 1 }),
      callJson($, JOBBER, 'search_visits', { status: 'late', limit: 1 }),
      callJson($, JOBBER, 'search_quotes', { status: 'awaiting_response', limit: 100 }),
      pnlMonthToDate($, QB_LL).catch(() => null),
    ])
    const list: any[] = quotes.quotes ?? []
    const openTotal = list.reduce((sum, q) => sum + (q.total ?? 0), 0)
    const viewed = list.filter(q => q.clientHubViewedAt && !q.approvedAt).length
    const more = quotes.pageInfo?.hasNextPage ? '+' : ''
    const lateCount = late.totalCount ?? (late.visits ?? []).length
    const lines: PulseLine[] = [
      { label: 'Visits today', value: String(today.totalCount ?? (today.visits ?? []).length) },
      { label: 'Late visits', value: String(lateCount), tone: lateCount > 0 ? 'warning' : 'success' },
      { label: 'Quotes awaiting reply', value: `${list.length}${more} · ${money(openTotal)}${more}` },
      { label: 'Viewed, not approved', value: String(viewed), tone: viewed > 0 ? 'warning' : undefined },
    ]
    if (qb) {
      lines.push({ label: 'Income MTD (QB)', value: money(qb.income) })
      lines.push(netLine(qb.net))
    }
    return lines
  })
}

async function vendingCard($: EngineInterface): Promise<PulseCard> {
  return settle('vending', 'Clever Vending', async () => {
    const qb = await pnlMonthToDate($, QB_VENDING)
    return [
      { label: 'Income MTD', value: money(qb.income) },
      { label: 'Expenses MTD', value: money(qb.expenses) },
      netLine(qb.net),
    ]
  })
}

async function refresh($: EngineInterface): Promise<void> {
  const now = await read($, pulse)
  if (now.isLoading) return
  await update($, pulse, p => ({ ...p, isLoading: true }))
  try {
    const cards = await Promise.all([adaptCard($), lemonCard($), vendingCard($)])
    const updatedAt = await $.clock.now()
    await update($, pulse, () => ({ cards, updatedAt, isLoading: false }))
  } catch {
    await update($, pulse, p => ({ ...p, isLoading: false }))
  }
}

const clockTime = (ms: number): string => {
  // Portland time, without relying on Intl time-zone data.
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const marchSecondSun = Date.UTC(y, 2, 8 + ((7 - new Date(Date.UTC(y, 2, 1)).getUTCDay()) % 7), 10)
  const novFirstSun = Date.UTC(y, 10, 1 + ((7 - new Date(Date.UTC(y, 10, 1)).getUTCDay()) % 7), 9)
  const offset = ms >= marchSecondSun && ms < novFirstSun ? -7 : -8
  const local = new Date(ms + offset * 3600 * 1000)
  let h = local.getUTCHours()
  const m = String(local.getUTCMinutes()).padStart(2, '0')
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${m}${ap}`
}

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pulse',
      description: 'Open the Business Pulse panel and refresh it',
    })
    void $.ui.open({ id: PANE, title: TITLE })
    $.clock.after(0, () => void refresh($))
    timer?.cancel()
    timer = $.clock.every(REFRESH_MS, () => void refresh($))
    return next(e)
  })

  on('command.run', { command: 'pulse' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    $.clock.after(0, () => void refresh($))
    return { text: 'Business Pulse opened — refreshing now.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, pulse)

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor>
            {p.isLoading
              ? 'Refreshing…'
              : p.updatedAt
                ? `Updated ${clockTime(p.updatedAt)}`
                : 'Not loaded yet'}
          </Text>
          <Button key="refresh" label="Refresh" onPress={() => void refresh($)} />
        </Box>
        {p.cards.map(card => (
          <Box key={card.id} flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>{card.title}</Text>
            {card.error ? (
              <Text color="error">Couldn't load: {card.error}</Text>
            ) : (
              card.lines.map(line => (
                <Box key={line.label} flexDirection="row" justifyContent="space-between">
                  <Text dimColor>{line.label}</Text>
                  <Text color={line.tone} tabular>
                    {line.value}
                  </Text>
                </Box>
              ))
            )}
          </Box>
        ))}
      </Box>
    )
  })
}
