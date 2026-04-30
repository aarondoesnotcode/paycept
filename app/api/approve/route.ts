import { NextRequest, NextResponse } from 'next/server'
import { invoices, auditLog } from '@/lib/invoices'

export async function POST(req: NextRequest) {
  const { id } = await req.json()
  const invoice = invoices.find(i => i.id === id)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  invoice.status = 'approved'
  invoice.decided_by = 'human'
  invoice.decided_at = new Date().toISOString()

  auditLog.unshift({
    timestamp: new Date().toLocaleTimeString('en-GB'),
    invoice_id: invoice.id,
    vendor: invoice.vendor,
    amount: invoice.amount,
    action: 'approved',
    decided_by: 'human',
    reason: 'Manually approved by finance team.',
  })

  return NextResponse.json({ invoices, auditLog })
}
