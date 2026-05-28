/**
 * Live FX data from fawazahmed0/exchange-api (free, no key, JSDelivr CDN).
 * https://github.com/fawazahmed0/exchange-api
 *
 * Endpoint shape:
 *   https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/{base}.json
 *   where {date} is "latest" or YYYY-MM-DD, {base} is a lowercase code.
 *
 * Response shape: { date: "YYYY-MM-DD", [base]: { [quote]: rate, ... } }
 *
 * Mirror (failover): https://{date}.currency-api.pages.dev/v1/currencies/{base}.json
 */

const JSDELIVR = (date: string, base: string) =>
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.json`;

const FALLBACK = (date: string, base: string) =>
  `https://${date}.currency-api.pages.dev/v1/currencies/${base}.json`;

export type DailyRates = {
  date: string;
  rates: Record<string, number>;
};

async function fetchAt(date: "latest" | string, base: string): Promise<DailyRates> {
  const baseLower = base.toLowerCase();
  const urls = [JSDELIVR(date, baseLower), FALLBACK(date, baseLower)];
  let lastErr: unknown = new Error("no urls");
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        lastErr = new Error(`${resp.status} ${resp.statusText}`);
        continue;
      }
      const data = (await resp.json()) as { date: string; [k: string]: unknown };
      const rates = data[baseLower] as Record<string, number> | undefined;
      if (!rates) throw new Error(`missing ${baseLower} key in response`);
      return { date: data.date, rates };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function offsetDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch the last `days` daily snapshots for `base`, oldest first.
 * Failed individual days are dropped silently; the caller decides whether
 * the surviving series is usable.
 */
export async function fetchHistory(base: string, days = 8): Promise<DailyRates[]> {
  const dates: Array<"latest" | string> = ["latest"];
  for (let i = 1; i < days; i++) dates.push(offsetDate(i));

  const results = await Promise.allSettled(dates.map((d) => fetchAt(d, base)));
  const ok: DailyRates[] = [];
  for (const r of results) if (r.status === "fulfilled") ok.push(r.value);
  return ok.sort((a, b) => a.date.localeCompare(b.date));
}
