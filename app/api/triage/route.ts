import { NextResponse } from 'next/server'
import { invoices, auditLog, guardrails } from '@/lib/invoices'
import { triageInvoice } from '@/lib/agent'
import { enrichVendor } from '@/lib/specter'
import { balance, startingBalance, transactions, debit } from '@/lib/treasury'

export async function POST() {
  const pending = invoices.filter(i => i.status === 'pending')

  for (const invoice of pending) {
    invoice.status = 'processing'

    try {
      invoice.specter = await enrichVendor(invoice.vendor)

      const decision = await triageInvoice(invoice, guardrails)

      invoice.status = decision.action === 'auto_pay' ? 'auto_paid' : 'escalated'
      invoice.flags = decision.flags
      invoice.reason = decision.reason
      invoice.confidence = decision.confidence
      invoice.decided_at = new Date().toISOString()
      invoice.decided_by = 'agent'

      if (decision.action === 'auto_pay') {
        debit({
          vendor: invoice.vendor,
          amount: invoice.amount,
          reference: invoice.id,
          initiated_by: 'agent',
        })
      }

      auditLog.unshift({
        timestamp: new Date().toLocaleTimeString('en-GB'),
        invoice_id: invoice.id,
        vendor: invoice.vendor,
        amount: invoice.amount,
        action: invoice.status,
        decided_by: 'agent',
        reason: decision.reason,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      invoice.status = 'escalated'
      invoice.reason = `Agent error — escalating as precaution: ${message}`
      invoice.confidence = 0
      invoice.flags = []
      invoice.decided_at = new Date().toISOString()
      invoice.decided_by = 'agent'

      auditLog.unshift({
        timestamp: new Date().toLocaleTimeString('en-GB'),
        invoice_id: invoice.id,
        vendor: invoice.vendor,
        amount: invoice.amount,
        action: 'escalated',
        decided_by: 'agent',
        reason: invoice.reason,
      })

      console.error(`[triage] Failed to process ${invoice.id}:`, err)
    }
  }

  return NextResponse.json({ invoices, auditLog, balance, startingBalance, transactions })
}

export async function GET() {
  return NextResponse.json({ invoices, auditLog, guardrails, balance, startingBalance, transactions })
}
