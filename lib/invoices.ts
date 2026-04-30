import { Invoice, GuardrailConfig, AuditEntry } from './types'

export const defaultGuardrails: GuardrailConfig = {
  auto_pay_threshold: 500,
  flag_new_vendors: true,
  flag_round_numbers: true,
  flag_duplicates: true,
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

export let invoices: Invoice[] = [...sampleInvoices.map(i => ({ ...i }))]
export let auditLog: AuditEntry[] = []
export let guardrails: GuardrailConfig = { ...defaultGuardrails }

export function resetInvoices() {
  invoices = [...sampleInvoices.map(i => ({ ...i }))]
  auditLog = []
}
