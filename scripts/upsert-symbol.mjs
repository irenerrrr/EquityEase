// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upsert-symbol.mjs SYMBOL "NAME" [ID]
// Example:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/upsert-symbol.mjs IXIC "NASDAQ Composite" 3

import { createClient } from '@supabase/supabase-js'

async function main() {
  const [symbol, name, idStr] = process.argv.slice(2)

  if (!symbol || !name) {
    console.error('[upsert-symbol] Usage: node scripts/upsert-symbol.mjs SYMBOL "NAME" [ID]')
    process.exit(1)
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[upsert-symbol] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })

  const payload = { symbol, name }
  let onConflict = 'symbol'
  if (idStr) {
    const id = Number(idStr)
    if (!Number.isFinite(id) || id <= 0) {
      console.error('[upsert-symbol] Invalid ID provided')
      process.exit(1)
    }
    payload.id = id
    onConflict = 'id'
  }

  console.log('[upsert-symbol] Upserting into symbols:', payload, 'onConflict=', onConflict)

  const { data, error } = await supabase
    .from('symbols')
    .upsert([payload], { onConflict, ignoreDuplicates: false })
    .select()

  if (error) {
    console.error('[upsert-symbol] Upsert failed:', error)
    process.exit(1)
  }

  console.log('[upsert-symbol] Success:', data)
}

main().catch((err) => {
  console.error('[upsert-symbol] Unexpected error:', err)
  process.exit(1)
})









