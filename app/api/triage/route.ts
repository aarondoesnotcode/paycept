import { NextResponse } from 'next/server'
import { invoices, auditLog, guardrails } from '@/lib/invoices'
import { triageInvoice } from '@/lib/agent'
import { enrichVendor } from '@/lib/specter'

export async function POST() {
  const pending = invoices.filter(i => i.status === 'pending')

  for (const invoice of pending) {
    invoice.status = 'processing'

    invoice.specter = await enrichVendor(invoice.vendor)

    const decision = await triageInvoice(invoice, guardrails)

    invoice.status = decision.action === 'auto_pay' ? 'auto_paid' : 'escalated'
    invoice.flags = decision.flags
    invoice.reason = decision.reason
    invoice.confidence = decision.confidence
    invoice.decided_at = new Date().toISOString()
    invoice.decided_by = 'agent'

    auditLog.unshift({
      timestamp: new Date().toLocaleTimeString('en-GB'),
      invoice_id: invoice.id,
      vendor: invoice.vendor,
      amount: invoice.amount,
      action: invoice.status,
      decided_by: 'agent',
      reason: decision.reason,
    })
  }

  return NextResponse.json({ invoices, auditLog })
}

export async function GET() {
  return NextResponse.json({ invoices, auditLog, guardrails })
}
