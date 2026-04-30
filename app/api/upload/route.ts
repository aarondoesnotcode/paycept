import { NextRequest, NextResponse } from 'next/server'
import { addInvoices, invoices, auditLog } from '@/lib/invoices'
import { extractFromCSV, extractFromImage, ExtractedInvoice } from '@/lib/extract'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fileName, mimeType, base64Data, text } = body as {
      fileName?: string
      mimeType?: string
      base64Data?: string
      text?: string
    }

    let extracted: ExtractedInvoice[] = []

    const isCsv =
      mimeType === 'text/csv' ||
      mimeType === 'application/vnd.ms-excel' ||
      (typeof fileName === 'string' && fileName.toLowerCase().endsWith('.csv'))

    if (isCsv && text) {
      extracted = extractFromCSV(text)
    } else if (base64Data && mimeType) {
      extracted = await extractFromImage(base64Data, mimeType)
    } else {
      return NextResponse.json({ error: 'Missing file content' }, { status: 400 })
    }

    if (extracted.length === 0) {
      return NextResponse.json(
        { error: 'No invoice data could be extracted from the file' },
        { status: 422 }
      )
    }

    const created = addInvoices(extracted)

    return NextResponse.json({
      created,
      invoices,
      auditLog,
      message: `Extracted ${created.length} invoice${created.length === 1 ? '' : 's'} from ${fileName || 'upload'}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[upload]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
