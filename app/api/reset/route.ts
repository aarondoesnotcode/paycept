import { NextResponse } from 'next/server'
import { resetInvoices, invoices, auditLog, guardrails, defaultGuardrails } from '@/lib/invoices'
import { resetTreasury, balance, startingBalance, transactions } from '@/lib/treasury'

export async function POST() {
  resetInvoices()
  resetTreasury()
  Object.assign(guardrails, defaultGuardrails)
  return NextResponse.json({ invoices, auditLog, guardrails, balance, startingBalance, transactions })
}
