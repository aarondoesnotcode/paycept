import { Invoice, GuardrailConfig, AuditEntry } from './types'

export const defaultGuardrails: GuardrailConfig = {
  auto_pay_threshold: 500,
  flag_new_vendors: true,
  flag_round_numbers: true,
  flag_duplicates: true,
  flag_invoice_splitting: true,
  flag_large_first_invoice: true,
  require_specter_check: true,
}

export const sampleInvoices: Invoice[] = [
  {
    id: 'inv_001',
    vendor: 'Pret A Manger',
    amount: 12.40,
    currency: 'GBP',
    account_ref: 'ACC-4421',
    date: '2026-04-30',
    is_new_vendor: false,
    prior_payments: 47,
    status: 'pending',
    flags: [],
  },
  {
    id: 'inv_002',
    vendor: 'Amazon Web Services',
    amount: 2340.00,
    currency: 'GBP',
    account_ref: 'ACC-1182',
    date: '2026-04-30',
    is_new_vendor: false,
    prior_payments: 24,
    status: 'pending',
    flags: [],
  },
  {
    id: 'inv_003',
    vendor: 'Novus Consulting Ltd',
    amount: 890.00,
    currency: 'GBP',
    account_ref: 'ACC-9903',
    date: '2026-04-30',
    is_new_vendor: true,
    prior_payments: 0,
    status: 'pending',
    flags: [],
  },
  {
    id: 'inv_004',
    vendor: 'Stripe Inc',
    amount: 5000.00,
    currency: 'GBP',
    account_ref: 'ACC-2201',
    date: '2026-04-30',
    is_new_vendor: false,
    prior_payments: 12,
    status: 'pending',
    flags: [],
  },
  {
    id: 'inv_005',
    vendor: 'Amazon Web Services',
    amount: 2340.00,
    currency: 'GBP',
    account_ref: 'ACC-1182',
    date: '2026-04-29',
    is_new_vendor: false,
    prior_payments: 24,
    status: 'pending',
    flags: [],
  },
]

export let invoices: Invoice[] = []
export let auditLog: AuditEntry[] = []
export let guardrails: GuardrailConfig = { ...defaultGuardrails }

export function resetInvoices() {
  invoices = []
  auditLog = []
  invoiceCounter = 0
}

let invoiceCounter = 0

export function addInvoices(newInvoices: Partial<Invoice>[]): Invoice[] {
  const created: Invoice[] = []

  for (const partial of newInvoices) {
    invoiceCounter++
    const vendor = (partial.vendor || 'Unknown vendor').trim()
    const isNew = !invoices.some(i => i.vendor.toLowerCase() === vendor.toLowerCase())
    const priorPayments = invoices.filter(i => i.vendor.toLowerCase() === vendor.toLowerCase()).length

    const invoice: Invoice = {
      id: partial.id || `inv_${String(invoiceCounter).padStart(3, '0')}`,
      vendor,
      amount: typeof partial.amount === 'number' ? partial.amount : parseFloat(String(partial.amount ?? '0')) || 0,
      currency: 'GBP',
      account_ref: partial.account_ref || `ACC-${Math.floor(1000 + Math.random() * 9000)}`,
      date: partial.date || new Date().toISOString().slice(0, 10),
      is_new_vendor: partial.is_new_vendor ?? isNew,
      prior_payments: partial.prior_payments ?? priorPayments,
      status: 'pending',
      flags: [],
    }

    invoices.push(invoice)
    created.push(invoice)
  }

  return created
}
