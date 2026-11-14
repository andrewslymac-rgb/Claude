import "server-only";
import { gql } from "./jobber";

/** Age groups on the AR board, by days past the due date. */
export const AR_BUCKETS = [
  { key: "current", label: "Current", help: "Sent, not yet due" },
  { key: "d1_30", label: "1–30 days", help: "1 to 30 days past due" },
  { key: "d31_60", label: "31–60 days", help: "31 to 60 days past due" },
  { key: "d61_90", label: "61–90 days", help: "61 to 90 days past due" },
  { key: "d90", label: "90+ days", help: "More than 90 days past due" },
] as const;
export type ArBucket = (typeof AR_BUCKETS)[number]["key"];

export type ArInvoice = {
  id: string;
  number: string;
  subject: string | null;
  status: string;
  total: number;
  balance: number;
  issuedOn: string | null;
  /** Pacific calendar date, YYYY-MM-DD. */
  dueOn: string | null;
  daysPastDue: number;
  bucket: ArBucket;
  url: string;
  client: { id: string; name: string; firstName: string | null; email: string | null; phone: string | null; smsOk: boolean };
};

export type ArPull = { invoices: ArInvoice[]; warnings: string[] };

const TZ = "America/Los_Angeles";
/** Jobber stores dates as midnight Pacific in UTC (e.g. 08:00Z). Read them back as Pacific dates. */
const pacificDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }) : null);
const todayPacific = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5);

export function bucketFor(days: number): ArBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90";
}

type Node = {
  id: string;
  invoiceNumber: string;
  subject: string | null;
  invoiceStatus: string;
  issuedDate: string | null;
  dueDate: string | null;
  jobberWebUri: string;
  amounts: { total: number; invoiceBalance: number };
  client: {
    id: string;
    name: string;
    firstName: string | null;
    emails: { address: string; primary: boolean }[];
    phones: { number: string; primary: boolean; smsAllowed: boolean }[];
  } | null;
};

// The status goes in as a literal (as the dashboard tile already does) so we don't depend on Jobber's enum type name.
const query = (status: string) => `query ($after: String) {
  invoices(filter: { invoiceStatus: ${status} }, first: 50, after: $after) {
    nodes {
      id invoiceNumber subject invoiceStatus issuedDate dueDate jobberWebUri
      amounts { total invoiceBalance }
      client { id name firstName emails { address primary } phones { number primary smsAllowed } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

/**
 * Every invoice that still has money owed: awaiting payment (which includes sent-not-due)
 * and past due. Paged 50 at a time, capped at 40 pages so a bad cursor can't loop forever.
 */
export async function pullUnpaidInvoices(workspaceId: string): Promise<ArPull> {
  const byId = new Map<string, ArInvoice>();
  const warnings: string[] = [];
  const today = todayPacific();

  for (const status of ["AWAITING_PAYMENT", "PAST_DUE"]) {
    let after: string | null = null;
    for (let page = 0; page < 40; page++) {
      const d: { invoices: { nodes: Node[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await gql(workspaceId, query(status), { after });
      for (const n of d.invoices.nodes) {
        const balance = n.amounts?.invoiceBalance ?? 0;
        if (balance <= 0.005) continue;
        const dueOn = pacificDate(n.dueDate);
        const days = dueOn ? Math.max(0, dayDiff(today, dueOn)) : 0;
        const email = n.client?.emails.find((e) => e.primary) ?? n.client?.emails[0];
        const phone = n.client?.phones.find((p) => p.primary) ?? n.client?.phones[0];
        byId.set(n.id, {
          id: n.id,
          number: n.invoiceNumber,
          subject: n.subject,
          status: n.invoiceStatus,
          total: n.amounts?.total ?? balance,
          balance,
          issuedOn: pacificDate(n.issuedDate),
          dueOn,
          daysPastDue: days,
          bucket: bucketFor(days),
          url: n.jobberWebUri,
          client: {
            id: n.client?.id ?? "",
            name: (n.client?.name ?? "Unknown client").replace(/\s+/g, " ").trim(),
            firstName: n.client?.firstName?.trim() || null,
            email: email?.address ?? null,
            phone: phone?.number ?? null,
            smsOk: phone?.smsAllowed ?? false,
          },
        });
      }
      if (!d.invoices.pageInfo.hasNextPage || !d.invoices.pageInfo.endCursor) break;
      after = d.invoices.pageInfo.endCursor;
      if (page === 39) warnings.push(`Stopped after 2,000 ${status.toLowerCase().replace("_", " ")} invoices. Some may be missing.`);
    }
  }
  const invoices = [...byId.values()].sort((a, b) => b.daysPastDue - a.daysPastDue || b.balance - a.balance);
  const noDue = invoices.filter((i) => !i.dueOn).length;
  if (noDue) warnings.push(`${noDue} invoice${noDue === 1 ? " has" : "s have"} no due date in Jobber, so ${noDue === 1 ? "it's" : "they're"} counted as current.`);
  return { invoices, warnings };
}
