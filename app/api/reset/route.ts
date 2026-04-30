import { NextResponse } from 'next/server'
import { resetInvoices, invoices, auditLog, guardrails, defaultGuardrails } from '@/lib/invoices'

export async function POST() {
  resetInvoices()
  Object.assign(guardrails, defaultGuardrails)
  return NextResponse.json({ invoices, auditLog, guardrails })
}
