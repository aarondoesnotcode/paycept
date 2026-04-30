export type InvoiceStatus = 'pending' | 'processing' | 'auto_paid' | 'escalated' | 'approved' | 'rejected'

export type InvoiceFlag = 'new_vendor' | 'above_threshold' | 'round_number' | 'duplicate' | 'high_confidence_ok'

export interface SpecterEnrichment {
  company_registered: boolean
  risk_score: 'low' | 'medium' | 'high' | 'unknown'
  context: string
}

export interface Invoice {
  id: string
  vendor: string
  amount: number
  currency: 'GBP'
  account_ref: string
  date: string
  is_new_vendor: boolean
  prior_payments: number
  status: InvoiceStatus
  flags: InvoiceFlag[]
  reason?: string
  confidence?: number
  specter?: SpecterEnrichment
  decided_at?: string
  decided_by?: 'agent' | 'human'
}

export interface GuardrailConfig {
  auto_pay_threshold: number
  flag_new_vendors: boolean
  flag_round_numbers: boolean
  flag_duplicates: boolean
  require_specter_check: boolean
}

export interface TriageDecision {
  action: 'auto_pay' | 'escalate'
  reason: string
  confidence: number
  flags: InvoiceFlag[]
}

export interface AuditEntry {
  timestamp: string
  invoice_id: string
  vendor: string
  amount: number
  action: string
  decided_by: 'agent' | 'human'
  reason: string
}

export interface TxEntry {
  id: string
  timestamp: string
  vendor: string
  amount: number
  type: 'debit' | 'credit'
  reference: string
  balance_after: number
  initiated_by: 'agent' | 'human'
}
