/*
  Backfill last N days of daily_prices for given symbols using the local data-maintenance API.
  Usage:
    node scripts/backfill-daily-prices.mjs            # backfill TQQQ,SQQQ for 180 days
    node scripts/backfill-daily-prices.mjs 120 TQQQ   # backfill TQQQ for 120 days
*/

const endpointBase = process.env.SITE_URL || 'https://equityease.duckdns.org'

async function backfill(symbols, days = 180) {
  const payload = {
    action: 'force_refresh',
    symbols,
    forceRefreshDays: Number(days) || 180
  }

  const url = `${endpointBase}/api/data-maintenance`
  console.log(`[Backfill] POST ${url} ->`, payload)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }

  if (!res.ok) {
    console.error('[Backfill] Failed:', res.status, res.statusText, json)
    process.exit(1)
  }

  console.log('[Backfill] Success:', JSON.stringify(json, null, 2))
}

async function main() {
  const [maybeDays, maybeSymbol] = process.argv.slice(2)
  if (maybeSymbol) {
    await backfill([maybeSymbol], Number(maybeDays) || 180)
    return
  }
  // default: both symbols for 180 days
  await backfill(['TQQQ', 'SQQQ'], 180)
}

main().catch(err => {
  console.error('[Backfill] Unexpected error:', err)
  process.exit(1)
})


