import Anthropic from '@anthropic-ai/sdk'
import { Invoice, GuardrailConfig, TriageDecision, InvoiceFlag } from './types'
import { invoices } from './invoices'

const client = new Anthropic()

export async function triageInvoice(
  invoice: Invoice,
  config: GuardrailConfig
): Promise<TriageDecision> {
  const flags: InvoiceFlag[] = []

  // Pre-flight guardrail checks — rules-based, no LLM needed
  if (config.flag_new_vendors && invoice.is_new_vendor) {
    flags.push('new_vendor')
  }

  if (invoice.amount > config.auto_pay_threshold) {
    flags.push('above_threshold')
  }

  if (config.flag_round_numbers && invoice.amount % 500 === 0 && invoice.amount >= 1000) {
    flags.push('round_number')
  }

  if (config.flag_duplicates) {
    const duplicate = invoices.find(
      i =>
        i.id !== invoice.id &&
        i.vendor === invoice.vendor &&
        i.amount === invoice.amount &&
        i.status !== 'rejected'
    )
    if (duplicate) flags.push('duplicate')
  }

  // Hard escalate if any flags triggered — no API call needed
  if (flags.length > 0) {
    const flagDescriptions: Record<InvoiceFlag, string> = {
      new_vendor: 'first invoice from this vendor — requires manual verification',
      above_threshold: `amount £${invoice.amount.toFixed(2)} exceeds auto-pay limit of £${config.auto_pay_threshold}`,
      round_number: 'suspiciously round amount — possible test or fraudulent transaction',
      duplicate: 'duplicate detected — same vendor and amount seen recently',
      high_confidence_ok: 'all checks passed',
    }
    const reasons = flags.map(f => flagDescriptions[f]).join('; ')
    return {
      action: 'escalate',
      reason: `Escalated: ${reasons}.`,
      confidence: 0.95,
      flags,
    }
  }

  // Only call Claude for clean, borderline invoices
  const systemPrompt = `You are an invoice triage agent for a UK business. Your job is to decide whether an invoice should be auto-paid or escalated to a human for review.

You will receive an invoice with vendor details, amount, payment history, and optional Specter enrichment data about the vendor.

Respond ONLY with valid JSON matching this exact schema:
{
  "action": "auto_pay" | "escalate",
  "reason": "one clear sentence explaining the decision",
  "confidence": 0.0 to 1.0
}

Rules:
- auto_pay only if: known vendor, normal amount, no anomalies, confidence > 0.85
- escalate if: any doubt, unusual pattern, or missing vendor information
- Be conservative. When in doubt, escalate.
- Keep reason short and plain — a non-technical finance manager will read it.`

  const userMessage = `Invoice to triage:
Vendor: ${invoice.vendor}
Amount: £${invoice.amount.toFixed(2)}
Account: ${invoice.account_ref}
New vendor: ${invoice.is_new_vendor}
Prior payments to this vendor: ${invoice.prior_payments}
${invoice.specter ? `Specter data: ${JSON.stringify(invoice.specter)}` : 'No Specter enrichment available.'}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return {
      action: parsed.action,
      reason: parsed.reason,
      confidence: parsed.confidence,
      flags: parsed.action === 'auto_pay' ? ['high_confidence_ok'] : [],
    }
  } catch {
    return {
      action: 'escalate',
      reason: 'Could not parse agent response — escalating as precaution.',
      confidence: 0.5,
      flags: [],
    }
  }
}
