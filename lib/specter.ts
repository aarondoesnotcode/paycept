import { SpecterEnrichment } from './types'

export async function enrichVendor(vendorName: string): Promise<SpecterEnrichment> {
  const apiKey = process.env.SPECTER_API_KEY

  if (!apiKey) {
    const knownVendors = ['Pret A Manger', 'Amazon Web Services', 'Stripe Inc']
    const isKnown = knownVendors.some(v => vendorName.toLowerCase().includes(v.toLowerCase()))
    return {
      company_registered: isKnown,
      risk_score: isKnown ? 'low' : 'medium',
      context: isKnown
        ? `${vendorName} is a well-known registered company with consistent trading history.`
        : `${vendorName} — limited data available. Treat as unverified.`,
    }
  }

  try {
    const res = await fetch(
      `https://api.specterdata.com/v1/company/lookup?name=${encodeURIComponent(vendorName)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) throw new Error(`Specter returned ${res.status}`)
    const data = await res.json()
    return {
      company_registered: data.registered ?? false,
      risk_score: data.risk_score ?? 'unknown',
      context: data.summary ?? 'No additional context available.',
    }
  } catch {
    const knownVendors = ['Pret A Manger', 'Amazon Web Services', 'Stripe Inc']
    const isKnown = knownVendors.some(v => vendorName.toLowerCase().includes(v.toLowerCase()))
    return {
      company_registered: isKnown,
      risk_score: isKnown ? 'low' : 'medium',
      context: isKnown
        ? `${vendorName} is a well-known registered company.`
        : `${vendorName} — Specter lookup unavailable. Treating as unverified.`,
    }
  }
}
