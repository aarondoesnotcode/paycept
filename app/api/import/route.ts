import { NextResponse } from 'next/server'
import { extractText } from 'unpdf'
import { invoices, auditLog } from '@/lib/invoices'
import { Invoice } from '@/lib/types'

type RawInvoice = Partial<Omit<Invoice, 'currency' | 'status' | 'flags'>>

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------
function parseCSV(text: string): RawInvoice[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  const col = (candidates: string[]) => candidates.find(c => headers.includes(c)) ?? null

  const vendorCol    = col(['vendor', 'company', 'supplier', 'name', 'payee'])
  const amountCol    = col(['amount', 'total', 'sum', 'price', 'value', 'invoice_amount'])
  const dateCol      = col(['date', 'invoice_date', 'issued', 'due_date'])
  const refCol       = col(['account_ref', 'account', 'reference', 'ref', 'invoice_no', 'invoice_number', 'inv_no', 'invoice_id'])
  const priorCol     = col(['prior_payments', 'payments', 'payment_count'])
  const newVendorCol = col(['is_new_vendor', 'new_vendor'])

  return lines.slice(1).map((line, idx) => {
    const cells = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
    const get = (colName: string | null) => (colName ? cells[headers.indexOf(colName)] ?? '' : '')

    const rawAmount = get(amountCol).replace(/[£$€,\s]/g, '')
    const amount = parseFloat(rawAmount)

    return {
      id: `imp_${Date.now()}_${idx}`,
      vendor: get(vendorCol) || undefined,
      amount: isNaN(amount) ? undefined : amount,
      date: get(dateCol) || new Date().toISOString().split('T')[0],
      account_ref: get(refCol) || undefined,
      prior_payments: parseInt(get(priorCol)) || 0,
      is_new_vendor: newVendorCol ? get(newVendorCol).toLowerCase() === 'true' : undefined,
    }
  }).filter(inv => inv.vendor || inv.amount)
}

// ---------------------------------------------------------------------------
// Text / regex extractor  (used for PDFs after text extraction, and .txt files)
// ---------------------------------------------------------------------------
function extractInvoicesFromText(text: string): RawInvoice[] {
  // Normalise whitespace for easier matching
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  // Try to find multiple invoice blocks by splitting on common dividers
  const blocks = splitIntoBlocks(lines)

  const results: RawInvoice[] = []
  for (const block of blocks) {
    const inv = parseBlock(block)
    if (inv.vendor || inv.amount) results.push({ ...inv, id: `imp_${Date.now()}_${results.length}` })
  }
  return results
}

function splitIntoBlocks(lines: string[]): string[][] {
  // If the document has repeating "Invoice" headings treat each as its own block
  const dividerPattern = /^(invoice|bill|receipt|statement)\b/i
  const dividerIndices = lines.reduce<number[]>((acc, line, i) => {
    if (dividerPattern.test(line)) acc.push(i)
    return acc
  }, [])

  if (dividerIndices.length > 1) {
    return dividerIndices.map((start, i) => {
      const end = dividerIndices[i + 1] ?? lines.length
      return lines.slice(start, end)
    })
  }
  // Single block
  return [lines]
}

function parseBlock(lines: string[]): RawInvoice {
  const text = lines.join('\n')

  // --- Amount ---
  // Prefer "Total Due", "Amount Due", "Invoice Total", "Grand Total", then plain currency amounts
  const amountPatterns = [
    /(?:total\s+(?:due|amount)|amount\s+(?:due|payable)|invoice\s+total|grand\s+total|balance\s+due)[:\s£$€]*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:total)[:\s£$€]+([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /[£$€]\s*([0-9,]+(?:\.[0-9]{1,2})?)/,
    /([0-9,]+\.[0-9]{2})\s*(?:GBP|USD|EUR)/i,
  ]
  let amount: number | undefined
  for (const p of amountPatterns) {
    const m = text.match(p)
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, ''))
      if (!isNaN(v) && v > 0) { amount = v; break }
    }
  }

  // --- Date ---
  const datePatterns = [
    /(?:invoice\s+date|date\s+issued|issue\s+date|date)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:invoice\s+date|date\s+issued|issue\s+date|date)[:\s]+(\d{1,2}\s+\w+\s+\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
  ]
  let date: string | undefined
  for (const p of datePatterns) {
    const m = text.match(p)
    if (m) { date = normaliseDate(m[1]); break }
  }

  // --- Account / Invoice reference ---
  const refPatterns = [
    /(?:invoice\s*(?:no|number|#|ref)|reference\s*(?:no|number)?|inv\s*(?:no|#))[:\s#]*([A-Z0-9\-\/]+)/i,
    /(?:account\s*(?:no|ref|number))[:\s]*([A-Z0-9\-\/]+)/i,
    /#\s*([A-Z0-9\-]{4,})/i,
  ]
  let account_ref: string | undefined
  for (const p of refPatterns) {
    const m = text.match(p)
    if (m && m[1].length >= 3) { account_ref = m[1].trim(); break }
  }

  // --- Vendor name ---
  // Look for explicit labels first, then fall back to first non-trivial line
  const vendorPatterns = [
    /(?:from|vendor|supplier|billed?\s+(?:by|from)|issued\s+by|company)[:\s]+([^\n,]{3,60})/i,
    /(?:^|\n)([A-Z][A-Za-z0-9\s&,.'()-]{2,50}(?:Ltd|Limited|Inc|LLC|LLP|Corp|Co|PLC|GmbH)\.?)/m,
  ]
  let vendor: string | undefined
  for (const p of vendorPatterns) {
    const m = text.match(p)
    if (m) { vendor = m[1].trim(); break }
  }
  // Fallback: first line that looks like a company name (title-case, not a keyword)
  if (!vendor) {
    const skipWords = /^(invoice|bill|receipt|statement|date|total|amount|from|to|ref|no|tax|vat|page)/i
    for (const line of lines) {
      if (line.length > 3 && line.length < 60 && !skipWords.test(line) && /[A-Za-z]/.test(line)) {
        vendor = line
        break
      }
    }
  }

  return {
    vendor,
    amount,
    date: date ?? new Date().toISOString().split('T')[0],
    account_ref,
    prior_payments: 0,
    is_new_vendor: true,
  }
}

function normaliseDate(raw: string): string {
  // Try parsing common formats → ISO YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return raw

  const dmyMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  const textMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (textMatch) {
    const [, d, mon, y] = textMatch
    const mIdx = monthNames.findIndex(m => mon.toLowerCase().startsWith(m))
    if (mIdx >= 0) return `${y}-${String(mIdx + 1).padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return new Date().toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const name = file.name.toLowerCase()

  let extracted: RawInvoice[] = []

  try {
    if (name.endsWith('.csv') || file.type === 'text/csv') {
      extracted = parseCSV(buffer.toString('utf-8'))
    } else if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const { text } = await extractText(new Uint8Array(bytes), { mergePages: true })
      extracted = extractInvoicesFromText(Array.isArray(text) ? text.join('\n') : text)
    } else if (name.endsWith('.txt') || name.endsWith('.json') || file.type.startsWith('text/')) {
      extracted = extractInvoicesFromText(buffer.toString('utf-8'))
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a PDF, CSV, or text file.' },
        { status: 400 }
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (extracted.length === 0) {
    return NextResponse.json(
      { error: 'No invoices could be extracted from this file. For best results use a CSV with columns: vendor, amount, date, account_ref' },
      { status: 422 }
    )
  }

  const newInvoices: Invoice[] = extracted.map((inv, idx) => ({
    id: inv.id ?? `imp_${Date.now()}_${idx}`,
    vendor: inv.vendor ?? 'Unknown Vendor',
    amount: inv.amount ?? 0,
    currency: 'GBP',
    account_ref: inv.account_ref ?? `ACC-${Math.floor(Math.random() * 9000) + 1000}`,
    date: inv.date ?? new Date().toISOString().split('T')[0],
    is_new_vendor: inv.is_new_vendor ?? true,
    prior_payments: inv.prior_payments ?? 0,
    status: 'pending',
    flags: [],
  }))

  invoices.push(...newInvoices)

  return NextResponse.json({ invoices, auditLog, imported: newInvoices.length })
}
