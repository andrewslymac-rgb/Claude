import type { Register } from 'claude-code'

// Tools that send something to a real person, move money, or destroy a record.
// Each is matched on the tool's full name, `mcp__<server>__<tool>`.
const RISKY: { kind: string; pattern: RegExp }[] = [
  { kind: 'Send a text / call (Quo)', pattern: /^mcp__Quo__(send-message|send-bulk-messages|send-group-message|start-agent-call|start-agent-conversation)$/ },
  { kind: 'Send email', pattern: /^mcp__.*gmail.*__(send_message|send_email|reply|forward)$/i },
  { kind: 'Trash / delete email', pattern: /^mcp__.*gmail.*__(trash_message|trash_thread|delete_draft|delete_label)$/i },
  { kind: 'Payroll / pay change (Gusto)', pattern: /^mcp__Gusto(_[0-9a-f]+)?__(run_payroll|update_payroll|update_compensation|manage_company_members|accept_reasonable_salary)$/ },
  { kind: 'QuickBooks: void / delete / undo', pattern: /^mcp__Intuit_QuickBooks_Labs(_[0-9a-f]+)?__(transactions_void|transactions_delete|attachments_delete|recurring_delete|bank_feed_undo|bank_feed_delete_excluded|bank_feed_delete_rule|reconciliation_undo|reconciliation_finish|company_close_books)$/ },
  { kind: 'QuickBooks: send to customer', pattern: /^mcp__Intuit_QuickBooks(_Labs)?(_[0-9a-f]+)?__(transactions_send|qbo_sales_send_\w+)$/ },
  { kind: 'QuickBooks: delete / payroll change', pattern: /^mcp__Intuit_QuickBooks__(qbo_sales_delete_\w+|qbo_payroll_update_employee|qbo_payroll_create_employee|money_onboarding_application_submit|qbo_onboarding_submit)$/ },
  { kind: 'Send for signature (SignNow)', pattern: /^mcp__SignNow__(send_invite|cancel_invite|send_invite_reminder)$/ },
  { kind: 'Delete calendar event', pattern: /^mcp__Google_Calendar(_[0-9a-f]+)?__delete_event$/ },
  { kind: 'Trash / share a Drive file', pattern: /^mcp__Google_Drive(_[0-9a-f]+)?__(trash_file|share_file)$/ },
  { kind: 'Delete in Notion', pattern: /^mcp__Notion__notion-delete-(pages|databases)$/ },
  { kind: 'Zapier write / run', pattern: /^mcp__Zapier__(execute_zapier_write_action|run_workflow|delete_workflow)$/ },
  { kind: 'Publish / post (vidIQ)', pattern: /^mcp__vidIQ__vidiq_(instagram_publish_reel|reply_to_comment|update_video|update_video_thumbnail|video_upload)$/ },
  { kind: 'Message employees (training reminder)', pattern: /^mcp__(Lemon_and_Lavender|Orchard_Adapt_Pest_Pros)__send_training_reminder$/ },
  { kind: 'Deploy a site (Lovable)', pattern: /^mcp__Lovable__deploy_project$/ },
  { kind: 'Delete link / site (Bitly)', pattern: /^mcp__Bitly__bitly_delete_\w+$/ },
  { kind: 'Atlassian destructive change', pattern: /^mcp__Atlassian_MCP__executeDestructive$/ },
  { kind: 'GitHub merge / delete', pattern: /^mcp__github__(merge_pull_request|delete_file)$/ },
]

// Ad platforms run changes through one router tool: guard only its write actions.
const ADS = /^mcp__Adspirer_Ads_Performance_Marketing_Agent__(google_ads|meta_ads|tiktok_ads|linkedin_ads|amazon_ads|microsoft_ads|walmart_ads|chatgpt_ads|klaviyo)$/
const ADS_READ = /^(get_|list_|search_|check_|preview_|analy|diagnose|audit|research)/

const BUSINESS: [RegExp, string][] = [
  [/Intuit_QuickBooks_Labs_061d7fc7|Lead_Sprint_Adapt|Orchard_Adapt|Orbit/, 'Adapt Pest Pros'],
  [/Intuit_QuickBooks_Labs_3f750f57/, 'Clever Vending'],
  [/Intuit_QuickBooks_Labs__|Lemon_and_Lavender|Jobber/, 'Lemon and Lavender Cleaning Co.'],
]

const RESERVED = new Set(['tool', 'tool_use_id', 'consent', 'agentId', 'agentType'])
// Fields worth showing first, when the call has them.
const FIRST = ['to', 'cc', 'bcc', 'recipients', 'phoneNumber', 'participantPhoneNumber', 'inboxPhoneNumber', 'subject', 'body', 'text', 'content', 'message', 'amount', 'total', 'id', 'ids', 'transaction_id', 'type']

const clip = (v: unknown, n = 220): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function riskOf(e: Record<string, unknown>): string | undefined {
  const tool = String(e.tool)
  const hit = RISKY.find(r => r.pattern.test(tool))
  if (hit) return hit.kind
  if (ADS.test(tool) && e.action === 'execute' && !ADS_READ.test(String(e.tool_name ?? ''))) {
    return `Change live ads (${String(e.tool_name ?? 'unknown action')})`
  }
  return undefined
}

function describe(e: Record<string, unknown>, kind: string): string {
  const tool = String(e.tool)
  const [, server = '', name = tool] = tool.match(/^mcp__(.+?)__(.+)$/) ?? []
  const business = BUSINESS.find(([re]) => re.test(`${server}__`))?.[1]
  const keys = Object.keys(e).filter(k => !RESERVED.has(k) && e[k] !== undefined && e[k] !== '')
  keys.sort((a, b) => {
    const ia = FIRST.indexOf(a)
    const ib = FIRST.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const fields = keys.slice(0, 8).map(k => `• ${k}: ${clip(e[k])}`)
  if (keys.length > 8) fields.push(`• …and ${keys.length - 8} more fields`)
  return [
    `⚠️ ${kind}${business ? ` — ${business}` : ''}`,
    `${server.replace(/_/g, ' ')} → ${name}`,
    '',
    ...fields,
    '',
    'Go ahead?',
  ].join('\n')
}

export const register: Register = on => {
  on('tool.call', { tool: /^mcp__/ }, async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const kind = riskOf(input)
    if (!kind) return next(e)

    const answer = await $.ui.ask(describe(input, kind), {
      header: 'Approve?',
      options: ['Approve', 'Cancel'],
    })
    if (answer === 'Approve') return next(e)
    if (answer === 'Cancel') return { deny: 'Andrew cancelled this action. Do not retry it; ask what to change.' }
    return { deny: `Andrew held this action and said: "${answer}". Adjust and ask again.` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'Guard rails could not get approval (dismissed or failed), so the action was not run.' },
  )
}
