import Anthropic from '@anthropic-ai/sdk'
import { Invoice } from './types'

export type ExtractedInvoice = Partial<Invoice>

// --- CSV PARSING ----------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"' && line[i - 1] !== '\\') {
      inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  cells.push(current.trim())
  return cells.map(c => c.replace(/^"|"$/g, ''))
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '_').trim()
}

const HEADER_ALIASES: Record<string, string> = {
  vendor: 'vendor',
  vendor_name: 'vendor',
  supplier: 'vendor',
  company: 'vendor',
  payee: 'vendor',
  amount: 'amount',
  total: 'amount',
  invoice_total: 'amount',
  amount_gbp: 'amount',
  invoice_id: 'id',
  invoice_no: 'id',
  invoice_number: 'id',
  reference: 'id',
  ref: 'id',
  account: 'account_ref',
  account_ref: 'account_ref',
  account_no: 'account_ref',
  account_number: 'account_ref',
  date: 'date',
  invoice_date: 'date',
  issue_date: 'date',
}

export function extractFromCSV(text: string): ExtractedInvoice[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return []

  const headerCells = parseCsvLine(lines[0]).map(normalizeKey)
  const headers = headerCells.map(h => HEADER_ALIASES[h] ?? h)

  const rows: ExtractedInvoice[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      if (cells[idx] !== undefined) row[h] = cells[idx]
    })

    if (!row.vendor && !row.amount) continue

    rows.push({
      id: row.id || undefined,
      vendor: row.vendor || 'Unknown vendor',
      amount: parseFloat((row.amount || '0').replace(/[£$,€]/g, '')) || 0,
      account_ref: row.account_ref || undefined,
      date: row.date || undefined,
    })
  }

  return rows
}

// --- CLAUDE VISION EXTRACTION --------------------------------------------

const EXTRACTION_PROMPT = `You are an invoice data extraction engine.
Extract invoice fields from the attached document and return ONLY a valid JSON array — no markdown, no commentary, no explanation.

Each invoice in the document should be one element of the array. If the document contains only one invoice, return an array with one object.

Schema for each element:
{
  "vendor": "company or person who issued the invoice",
  "amount": numeric value only (no currency symbols, no thousands separators),
  "id": "invoice number or reference (empty string if absent)",
  "account_ref": "account or reference number (empty string if absent)",
  "date": "YYYY-MM-DD format if present, otherwise empty string"
}

Rules:
- "amount" must be a JSON number, not a string
- Strip currency symbols and thousands separators
- If a field is missing, use empty string for strings or 0 for amount
- Return ONLY the JSON array. Do not wrap it in markdown code fences.`

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function extractFromImage(
  base64Data: string,
  mimeType: string
): Promise<ExtractedInvoice[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your_anthropic_key_here') {
    throw new Error('ANTHROPIC_API_KEY not set in .env.local — required for PDF / image extraction')
  }

  const client = new Anthropic({ apiKey })

  const isPdf = mimeType === 'application/pdf'
  const isImage = SUPPORTED_IMAGE_TYPES.includes(mimeType)

  if (!isPdf && !isImage) {
    throw new Error(`Unsupported file type "${mimeType}". Use PDF, JPEG, PNG, GIF, or WEBP.`)
  }

  const attachment = isPdf
    ? {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: base64Data,
        },
      }
    : {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: base64Data,
        },
      }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [attachment, { type: 'text', text: EXTRACTION_PROMPT }],
      },
    ],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
  const cleaned = text.replace(/```json|```/g, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Could not parse Claude response as JSON')
  }

  const array = Array.isArray(parsed) ? parsed : [parsed]

  return array.map((row): ExtractedInvoice => {
    const r = row as Record<string, unknown>
    return {
      id: typeof r.id === 'string' && r.id ? r.id : undefined,
      vendor: typeof r.vendor === 'string' ? r.vendor : 'Unknown vendor',
      amount: typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount ?? '0')) || 0,
      account_ref: typeof r.account_ref === 'string' && r.account_ref ? r.account_ref : undefined,
      date: typeof r.date === 'string' && r.date ? r.date : undefined,
    }
  })
}
