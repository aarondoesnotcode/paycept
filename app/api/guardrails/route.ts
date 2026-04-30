import { NextRequest, NextResponse } from 'next/server'
import { guardrails } from '@/lib/invoices'

export async function GET() {
  return NextResponse.json({ guardrails })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  Object.assign(guardrails, body)
  return NextResponse.json({ guardrails })
}
