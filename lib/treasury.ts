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

const DEFAULT_BALANCE = 50_000

export let balance = DEFAULT_BALANCE
export let startingBalance = DEFAULT_BALANCE
export let transactions: TxEntry[] = []

let txCounter = 1

export function setStartingBalance(amount: number) {
  startingBalance = amount
  balance = amount
  transactions = []
  txCounter = 1
}

export function debit(params: {
  vendor: string
  amount: number
  reference: string
  initiated_by: 'agent' | 'human'
}): TxEntry {
  balance = parseFloat((balance - params.amount).toFixed(2))

  const entry: TxEntry = {
    id: `tx_${String(txCounter++).padStart(4, '0')}`,
    timestamp: new Date().toLocaleTimeString('en-GB'),
    vendor: params.vendor,
    amount: params.amount,
    type: 'debit',
    reference: params.reference,
    balance_after: balance,
    initiated_by: params.initiated_by,
  }

  transactions.unshift(entry)
  return entry
}

export function resetTreasury() {
  balance = startingBalance
  transactions = []
  txCounter = 1
}
