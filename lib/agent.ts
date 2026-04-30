import { Invoice, GuardrailConfig, TriageDecision, InvoiceFlag } from './types'
import { invoices } from './invoices'

export async function triageInvoice(
  invoice: Invoice,
  config: GuardrailConfig
): Promise<TriageDecision> {
  const flags: InvoiceFlag[] = []
  const reasons: string[] = []

  // --- Guardrail checks ---

  if (config.flag_new_vendors && invoice.is_new_vendor) {
    flags.push('new_vendor')
    reasons.push('first invoice from this vendor — requires manual verification')
  }

  if (invoice.amount > config.auto_pay_threshold) {
    flags.push('above_threshold')
    reasons.push(`amount £${invoice.amount.toFixed(2)} exceeds auto-pay limit of £${config.auto_pay_threshold}`)
  }

  if (config.flag_round_numbers && invoice.amount % 500 === 0 && invoice.amount >= 1000) {
    flags.push('round_number')
    reasons.push('suspiciously round amount — possible test or fraudulent transaction')
  }

  if (config.flag_duplicates) {
    const duplicate = invoices.find(
      i =>
        i.id !== invoice.id &&
        i.vendor === invoice.vendor &&
        i.amount === invoice.amount &&
        i.status !== 'rejected'
    )
    if (duplicate) {
      flags.push('duplicate')
      reasons.push('duplicate detected — same vendor and amount seen recently')
    }
  }

  // --- Specter risk check ---
  if (invoice.specter) {
    if (invoice.specter.risk_score === 'high') {
      reasons.push('Specter flags this vendor as high risk')
      // Escalate even if no other flags triggered
      return {
        action: 'escalate',
        reason: `Escalated: ${reasons.join('; ')}.`,
        confidence: 0.97,
        flags,
      }
    }
    if (invoice.specter.risk_score === 'unknown' && flags.length === 0) {
      reasons.push('Specter has no data on this vendor')
      flags.push('new_vendor')
      return {
        action: 'escalate',
        reason: `Escalated: ${reasons.join('; ')}.`,
        confidence: 0.85,
        flags,
      }
    }
  }

  // Hard escalate if guardrail flags triggered
  if (flags.length > 0) {
    return {
      action: 'escalate',
      reason: `Escalated: ${reasons.join('; ')}.`,
      confidence: reasons.length > 1 ? 0.97 : 0.90,
      flags,
    }
  }

  // --- Auto-pay: all checks passed ---
  const specterBoost = invoice.specter?.risk_score === 'low' ? 0.02 : 0
  const historyBoost = invoice.prior_payments > 10 ? 0.02 : 0
  const confidence = Math.min(0.97, 0.90 + specterBoost + historyBoost)

  const specterNote = invoice.specter?.risk_score === 'low'
    ? ` Specter confirms low risk.`
    : ''

  return {
    action: 'auto_pay',
    reason: `Known vendor with ${invoice.prior_payments} prior payments, within auto-pay limit.${specterNote}`,
    confidence,
    flags: ['high_confidence_ok'],
  }
}
