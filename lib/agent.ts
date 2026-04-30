import { Invoice, GuardrailConfig, TriageDecision, InvoiceFlag } from './types'
import { invoices } from './invoices'

export async function triageInvoice(
  invoice: Invoice,
  config: GuardrailConfig
): Promise<TriageDecision> {
  const flags: InvoiceFlag[] = []
  const reasons: string[] = []

  // --- HARD CHECKS (any one of these is enough to escalate) -------------

  // New vendor
  if (config.flag_new_vendors && invoice.is_new_vendor) {
    flags.push('new_vendor')
    reasons.push('first invoice from this vendor — requires manual verification')

    // Layered: large debut invoice from a new vendor
    if (config.flag_large_first_invoice && invoice.amount > 1000) {
      flags.push('large_first_invoice')
      reasons.push(`new vendor's first invoice of £${invoice.amount.toFixed(2)} is unusually large`)
    }
  }

  // Above auto-pay threshold
  if (invoice.amount > config.auto_pay_threshold) {
    flags.push('above_threshold')
    reasons.push(`amount £${invoice.amount.toFixed(2)} exceeds auto-pay limit of £${config.auto_pay_threshold}`)
  }

  // Duplicate
  if (config.flag_duplicates) {
    const duplicate = invoices.find(
      i =>
        i.id !== invoice.id &&
        i.vendor.toLowerCase() === invoice.vendor.toLowerCase() &&
        i.amount === invoice.amount &&
        i.status !== 'rejected'
    )
    if (duplicate) {
      flags.push('duplicate')
      reasons.push('duplicate detected — same vendor and amount seen recently')
    }
  }

  // Invoice splitting — multiple sub-threshold invoices from the same vendor
  // that together exceed the threshold (classic threshold-evasion fraud)
  if (config.flag_invoice_splitting) {
    const sameVendorOthers = invoices.filter(
      i =>
        i.id !== invoice.id &&
        i.vendor.toLowerCase() === invoice.vendor.toLowerCase() &&
        i.status !== 'rejected'
    )
    if (sameVendorOthers.length >= 1) {
      const sumAll = invoice.amount + sameVendorOthers.reduce((s, i) => s + i.amount, 0)
      const allSubThreshold =
        invoice.amount <= config.auto_pay_threshold &&
        sameVendorOthers.every(i => i.amount <= config.auto_pay_threshold)
      if (sumAll > config.auto_pay_threshold && allSubThreshold && sameVendorOthers.length >= 1) {
        flags.push('invoice_splitting')
        reasons.push(
          `possible invoice splitting — ${sameVendorOthers.length + 1} invoices from this vendor totalling £${sumAll.toFixed(2)}, each just under the £${config.auto_pay_threshold} limit`
        )
      }
    }
  }

  // --- SOFT CHECK (only adds weight if other concerns exist) ------------

  // Round number — alone this is too noisy (real retainers, deposits are
  // round). Only include it if other risk signals already fired.
  if (
    config.flag_round_numbers &&
    invoice.amount % 500 === 0 &&
    invoice.amount >= 1000 &&
    flags.length > 0
  ) {
    flags.push('round_number')
    reasons.push('round amount combined with other signals raises confidence in escalation')
  }

  // --- Specter risk overrides ------------------------------------------
  if (invoice.specter) {
    if (invoice.specter.risk_score === 'high') {
      reasons.push('Specter flags this vendor as high risk')
      return {
        action: 'escalate',
        reason: `Escalated: ${reasons.join('; ')}.`,
        confidence: 0.97,
        flags,
      }
    }
    if (invoice.specter.risk_score === 'unknown' && flags.length === 0) {
      flags.push('new_vendor')
      reasons.push('Specter has no data on this vendor')
      return {
        action: 'escalate',
        reason: `Escalated: ${reasons.join('; ')}.`,
        confidence: 0.85,
        flags,
      }
    }
  }

  // Escalate if any flag fired
  if (flags.length > 0) {
    return {
      action: 'escalate',
      reason: `Escalated: ${reasons.join('; ')}.`,
      confidence: reasons.length > 1 ? 0.97 : 0.90,
      flags,
    }
  }

  // --- Auto-pay: clean invoice ------------------------------------------
  const specterBoost = invoice.specter?.risk_score === 'low' ? 0.02 : 0
  const historyBoost = invoice.prior_payments > 10 ? 0.02 : 0
  const confidence = Math.min(0.97, 0.90 + specterBoost + historyBoost)

  const specterNote =
    invoice.specter?.risk_score === 'low' ? ' Specter confirms low risk.' : ''

  return {
    action: 'auto_pay',
    reason: `Known vendor with ${invoice.prior_payments} prior payments, within auto-pay limit.${specterNote}`,
    confidence,
    flags: ['high_confidence_ok'],
  }
}
