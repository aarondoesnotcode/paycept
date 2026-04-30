import { NextRequest, NextResponse } from 'next/server'
import { balance, startingBalance, transactions, setStartingBalance } from '@/lib/treasury'

export async function GET() {
  return NextResponse.json({ balance, startingBalance, transactions })
}

export async function PUT(req: NextRequest) {
  const { amount } = await req.json()
  const parsed = parseFloat(amount)

  if (isNaN(parsed) || parsed < 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  setStartingBalance(parsed)

  return NextResponse.json({ balance, startingBalance, transactions })
}
