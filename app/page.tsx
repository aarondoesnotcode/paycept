'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Invoice, AuditEntry, GuardrailConfig, TxEntry } from '@/lib/types'

const DEFAULT_STARTING_BALANCE = 50_000

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-zinc-700 text-zinc-300' },
  processing: { label: 'Processing', className: 'bg-amber-500/20 text-amber-400 animate-pulse' },
  auto_paid: { label: 'Auto-paid', className: 'bg-emerald-500/20 text-emerald-400' },
  escalated: { label: 'Escalated', className: 'bg-red-500/20 text-red-400' },
  approved: { label: 'Approved', className: 'bg-teal-500/20 text-teal-400' },
  rejected: { label: 'Rejected', className: 'bg-zinc-600/40 text-zinc-500' },
}

const FLAG_LABELS: Record<string, string> = {
  new_vendor: 'New vendor',
  above_threshold: 'Above threshold',
  round_number: 'Round number',
  duplicate: 'Duplicate',
  high_confidence_ok: 'All checks passed',
}

const FLAG_STYLES: Record<string, string> = {
  new_vendor: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  above_threshold: 'bg-red-500/10 text-red-400 border border-red-500/20',
  round_number: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  duplicate: 'bg-red-600/10 text-red-500 border border-red-600/20',
  high_confidence_ok: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

const RISK_STYLES: Record<string, string> = {
  low: 'text-emerald-400',
  medium: 'text-amber-400',
  high: 'text-red-400',
  unknown: 'text-zinc-500',
}

export default function Home() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [balance, setBalance] = useState<number>(DEFAULT_STARTING_BALANCE)
  const [startingBalance, setStartingBalance] = useState<number>(DEFAULT_STARTING_BALANCE)
  const [transactions, setTransactions] = useState<TxEntry[]>([])
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')
  const [balanceSaving, setBalanceSaving] = useState(false)
  const [sliderMax, setSliderMax] = useState(2000)
  const [editingSliderMax, setEditingSliderMax] = useState(false)
  const [sliderMaxInput, setSliderMaxInput] = useState('')
  const [guardrails, setGuardrails] = useState<GuardrailConfig>({
    auto_pay_threshold: 500,
    flag_new_vendors: true,
    flag_round_numbers: true,
    flag_duplicates: true,
    require_specter_check: true,
  })
  const [localGuardrails, setLocalGuardrails] = useState<GuardrailConfig>({ ...guardrails })
  const [triageLoading, setTriageLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [guardrailSaving, setGuardrailSaving] = useState(false)
  const [savedGuardrails, setSavedGuardrails] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function syncData(data: { invoices?: Invoice[]; auditLog?: AuditEntry[]; guardrails?: GuardrailConfig; balance?: number; startingBalance?: number; transactions?: TxEntry[] }) {
    if (data.invoices) setInvoices(data.invoices)
    if (data.auditLog) setAuditLog(data.auditLog)
    if (data.guardrails) { setGuardrails(data.guardrails); setLocalGuardrails(data.guardrails) }
    if (data.balance !== undefined) setBalance(data.balance)
    if (data.startingBalance !== undefined) setStartingBalance(data.startingBalance)
    if (data.transactions) setTransactions(data.transactions)
  }

  async function saveStartingBalance() {
    const parsed = parseFloat(balanceInput.replace(/,/g, ''))
    if (isNaN(parsed) || parsed < 0) return
    setBalanceSaving(true)
    try {
      const res = await fetch('/api/treasury', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsed }),
      })
      syncData(await res.json())
      setEditingBalance(false)
    } finally {
      setBalanceSaving(false)
    }
  }

  const fetchState = useCallback(async () => {
    const res = await fetch('/api/triage')
    const data = await res.json()
    syncData(data)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchState()
  }, [fetchState])

  async function runTriage() {
    setTriageLoading(true)
    try {
      const res = await fetch('/api/triage', { method: 'POST' })
      if (!res.ok) { console.error('[triage]', res.status, await res.text()); return }
      syncData(await res.json())
    } catch (err) {
      console.error('[triage] Fetch error', err)
    } finally {
      setTriageLoading(false)
    }
  }

  async function handleReset() {
    setResetLoading(true)
    try {
      syncData(await (await fetch('/api/reset', { method: 'POST' })).json())
    } finally {
      setResetLoading(false)
    }
  }

  async function handleApprove(id: string) {
    const res = await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    syncData(await res.json())
  }

  async function handleReject(id: string) {
    const res = await fetch('/api/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    syncData(await res.json())
  }

  async function saveGuardrails() {
    setGuardrailSaving(true)
    try {
      const res = await fetch('/api/guardrails', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localGuardrails),
      })
      const data = await res.json()
      setGuardrails(data.guardrails)
      setSavedGuardrails(true)
      setTimeout(() => setSavedGuardrails(false), 2000)
    } finally {
      setGuardrailSaving(false)
    }
  }

  async function handleImport(file: File) {
    setImportLoading(true)
    setImportError(null)
    setImportSuccess(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data.error ?? 'Import failed')
      } else {
        syncData(data)
        setImportSuccess(data.imported)
        setTimeout(() => setImportSuccess(null), 4000)
      }
    } catch {
      setImportError('Network error — could not import file')
    } finally {
      setImportLoading(false)
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleImport(file)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleImport(file)
  }

  const counts = {
    pending: invoices.filter(i => i.status === 'pending').length,
    auto_paid: invoices.filter(i => i.status === 'auto_paid').length,
    escalated: invoices.filter(i => i.status === 'escalated').length,
    approved: invoices.filter(i => i.status === 'approved').length,
    rejected: invoices.filter(i => i.status === 'rejected').length,
  }

  const hasPending = counts.pending > 0

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/60 px-6 py-4">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-zinc-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-zinc-900">
                <rect x="3" y="3" width="7" height="9" rx="1" fill="currentColor" />
                <rect x="14" y="3" width="7" height="5" rx="1" fill="currentColor" />
                <rect x="3" y="16" width="7" height="5" rx="1" fill="currentColor" />
                <rect x="14" y="12" width="7" height="9" rx="1" fill="currentColor" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-zinc-100 tracking-tight">Paycept</span>
              <span className="text-zinc-600 mx-2">/</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Live balance */}
            <div className="hidden md:flex flex-col items-end">
              <span className={`font-mono font-bold text-base leading-none transition-colors ${balance < 10_000 ? 'text-red-400' : 'text-white'}`}>
                £{balance.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-zinc-600 text-xs mt-0.5">
                of £{startingBalance.toLocaleString('en-GB')} starting
              </span>
            </div>
            <div className="w-px h-6 bg-zinc-800 hidden md:block" />
            {/* Status summary */}
            <div className="hidden sm:flex items-center gap-4 font-mono text-xs">
              <span className="text-emerald-400">{counts.auto_paid} auto-paid</span>
              <span className="text-zinc-700">·</span>
              <span className="text-red-400">{counts.escalated + counts.approved + counts.rejected} escalated</span>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-400">{counts.pending} pending</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                disabled={resetLoading}
                className="px-3 py-1.5 text-xs text-zinc-400 border border-zinc-700 rounded-md hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-50"
              >
                {resetLoading ? 'Resetting…' : 'Reset'}
              </button>
              <button
                onClick={runTriage}
                disabled={triageLoading || !hasPending}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all disabled:opacity-40
                  ${hasPending && !triageLoading
                    ? 'bg-white text-zinc-900 hover:bg-zinc-100 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                    : 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                  }`}
              >
                {triageLoading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin" />
                    Running…
                  </span>
                ) : hasPending ? 'Run triage' : 'All processed'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left column — invoice queue */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
              Invoice Queue
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-600 font-mono">{invoices.length} invoices</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 transition-colors disabled:opacity-50"
              >
                {importLoading ? (
                  <>
                    <span className="inline-block w-3 h-3 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                      <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Import file
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,.txt,.json"
                className="hidden"
                onChange={onFileInputChange}
              />
            </div>
          </div>

          {/* Import feedback */}
          {importError && (
            <div className="mb-3 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {importError}
              <button onClick={() => setImportError(null)} className="ml-auto text-red-500 hover:text-red-300">✕</button>
            </div>
          )}
          {importSuccess !== null && (
            <div className="mb-3 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {importSuccess} invoice{importSuccess !== 1 ? 's' : ''} imported successfully
            </div>
          )}

          {/* Invoice list / empty drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`transition-all duration-200 rounded-xl ${dragOver ? 'ring-2 ring-zinc-500 ring-offset-2 ring-offset-[#0a0a0a]' : ''}`}
          >
            {invoices.length === 0 && !importLoading ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-14 text-center transition-colors
                  ${dragOver ? 'border-zinc-500 bg-zinc-800/40' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40'}`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${dragOver ? 'bg-zinc-700' : 'bg-zinc-800'}`}>
                    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-zinc-400">
                      <path d="M12 4v12M8 12l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Drop a file or click to import</p>
                    <p className="text-xs text-zinc-600 mt-1">Supports PDF invoices, CSV spreadsheets, and plain text</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {invoices.map(invoice => (
                  <InvoiceCard
                    key={invoice.id}
                    invoice={invoice}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
                {importLoading && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 flex items-center gap-3">
                    <span className="inline-block w-4 h-4 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin shrink-0" />
                    <span className="text-xs text-zinc-500">Extracting invoices from file…</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Guardrails panel */}
          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-5 shadow-[0_0_40px_rgba(0,0,0,0.4)]">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <h2 className="text-sm font-semibold text-zinc-100">Agent guardrails</h2>
              </div>
              <p className="text-xs text-zinc-500">The agent will not act outside these rules</p>
            </div>

            <div className="space-y-5">
              {/* Threshold slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-zinc-300">Auto-pay threshold</label>
                  <span className="font-mono text-sm text-white">
                    £{localGuardrails.auto_pay_threshold.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={Math.max(1, Math.floor(sliderMax / 40))}
                  value={Math.min(localGuardrails.auto_pay_threshold, sliderMax)}
                  onChange={e =>
                    setLocalGuardrails(g => ({ ...g, auto_pay_threshold: Number(e.target.value) }))
                  }
                  className="w-full h-1.5 accent-white bg-zinc-700 rounded-full appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-zinc-600 text-xs mt-1 font-mono">
                  <span>£0</span>
                  {editingSliderMax ? (
                    <span className="flex items-center gap-1">
                      <span>£</span>
                      <input
                        type="number"
                        min={100}
                        value={sliderMaxInput}
                        onChange={e => setSliderMaxInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const v = parseInt(sliderMaxInput)
                            if (!isNaN(v) && v >= 100) setSliderMax(v)
                            setEditingSliderMax(false)
                          }
                          if (e.key === 'Escape') setEditingSliderMax(false)
                        }}
                        onBlur={() => {
                          const v = parseInt(sliderMaxInput)
                          if (!isNaN(v) && v >= 100) setSliderMax(v)
                          setEditingSliderMax(false)
                        }}
                        autoFocus
                        className="w-20 bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-zinc-400"
                      />
                    </span>
                  ) : (
                    <button
                      onClick={() => { setSliderMaxInput(sliderMax.toString()); setEditingSliderMax(true) }}
                      className="text-zinc-600 hover:text-zinc-300 transition-colors group"
                      title="Click to change max"
                    >
                      £{sliderMax.toLocaleString()}
                      <span className="ml-1 text-zinc-700 group-hover:text-zinc-500 transition-colors">✎</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <GuardrailToggle
                  label="Flag new vendors"
                  description="Escalate any invoice from a vendor with no payment history"
                  value={localGuardrails.flag_new_vendors}
                  onChange={v => setLocalGuardrails(g => ({ ...g, flag_new_vendors: v }))}
                />
                <GuardrailToggle
                  label="Flag round numbers"
                  description="Escalate suspiciously round amounts (multiples of £500 over £1k)"
                  value={localGuardrails.flag_round_numbers}
                  onChange={v => setLocalGuardrails(g => ({ ...g, flag_round_numbers: v }))}
                />
                <GuardrailToggle
                  label="Flag duplicates"
                  description="Escalate if same vendor and amount has been seen recently"
                  value={localGuardrails.flag_duplicates}
                  onChange={v => setLocalGuardrails(g => ({ ...g, flag_duplicates: v }))}
                />
              </div>

              <button
                onClick={saveGuardrails}
                disabled={guardrailSaving}
                className={`w-full py-2 text-xs font-semibold rounded-lg transition-all
                  ${savedGuardrails
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                    : 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600'
                  } disabled:opacity-50`}
              >
                {savedGuardrails ? '✓ Guardrails saved' : guardrailSaving ? 'Saving…' : 'Save guardrails'}
              </button>
            </div>
          </div>

          {/* Treasury panel */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">Treasury</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Live payment ledger</p>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold text-base leading-none ${balance < startingBalance * 0.2 ? 'text-red-400' : 'text-emerald-400'}`}>
                    £{balance.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-zinc-600 text-xs mt-0.5 font-mono">
                    −£{(startingBalance - balance).toLocaleString('en-GB', { minimumFractionDigits: 2 })} paid out
                  </div>
                </div>
              </div>

              {/* Starting balance editor */}
              <div className="mt-3 pt-3 border-t border-zinc-800/60">
                {editingBalance ? (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-xs font-mono">£</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={balanceInput}
                      onChange={e => setBalanceInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveStartingBalance()
                        if (e.key === 'Escape') setEditingBalance(false)
                      }}
                      placeholder={startingBalance.toString()}
                      autoFocus
                      className="flex-1 bg-zinc-800 border border-zinc-600 rounded-md px-2 py-1 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400"
                    />
                    <button
                      onClick={saveStartingBalance}
                      disabled={balanceSaving}
                      className="px-2.5 py-1 text-xs font-semibold bg-white text-zinc-900 rounded-md hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                    >
                      {balanceSaving ? '…' : 'Set'}
                    </button>
                    <button
                      onClick={() => setEditingBalance(false)}
                      className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setBalanceInput(startingBalance.toString()); setEditingBalance(true) }}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors group"
                  >
                    <span className="font-mono">Starting: £{startingBalance.toLocaleString('en-GB')}</span>
                    <span className="text-zinc-700 group-hover:text-zinc-400 transition-colors">· Edit</span>
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto max-h-52">
              {transactions.length === 0 ? (
                <div className="px-5 py-6 text-center text-zinc-600 text-xs">
                  No payments yet.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {transactions.map(tx => (
                    <TxRow key={tx.id} tx={tx} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Audit log */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-100">Audit log</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Every decision, immutable</p>
            </div>
            <div className="overflow-y-auto max-h-64">
              {auditLog.length === 0 ? (
                <div className="px-5 py-8 text-center text-zinc-600 text-xs">
                  No decisions yet. Run triage to begin.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {auditLog.map((entry, i) => (
                    <AuditRow key={i} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InvoiceCard({
  invoice,
  onApprove,
  onReject,
}: {
  invoice: Invoice
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const status = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.pending

  return (
    <div
      className={`rounded-xl border bg-zinc-900/60 p-5 transition-all duration-300
        ${invoice.status === 'auto_paid' ? 'border-emerald-800/30' : ''}
        ${invoice.status === 'escalated' ? 'border-red-800/30' : ''}
        ${invoice.status === 'approved' ? 'border-teal-800/30' : ''}
        ${invoice.status === 'rejected' ? 'border-zinc-800/30 opacity-60' : ''}
        ${invoice.status === 'pending' || invoice.status === 'processing' ? 'border-zinc-800' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-zinc-100 text-sm leading-tight truncate">
            {invoice.vendor}
          </div>
          <div className="text-zinc-600 text-xs font-mono mt-0.5">{invoice.id} · {invoice.account_ref}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="font-mono font-bold text-lg text-white leading-none">
            £{invoice.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Flags */}
      {invoice.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {invoice.flags.map(flag => (
            <span
              key={flag}
              className={`text-xs px-2 py-0.5 rounded-md font-medium ${FLAG_STYLES[flag] ?? ''}`}
            >
              {FLAG_LABELS[flag] ?? flag}
            </span>
          ))}
        </div>
      )}

      {/* Reason */}
      {invoice.reason && (
        <p className="text-xs text-zinc-400 italic mb-3 leading-relaxed">{invoice.reason}</p>
      )}

      {/* Specter enrichment */}
      {invoice.specter && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-zinc-600">Specter:</span>
          <span className={`text-xs font-mono ${RISK_STYLES[invoice.specter.risk_score]}`}>
            {invoice.specter.risk_score} risk
          </span>
          <span className="text-zinc-700">·</span>
          <span className="text-xs text-zinc-500 truncate">{invoice.specter.context}</span>
        </div>
      )}

      {/* Human action buttons for escalated invoices */}
      {invoice.status === 'escalated' && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
          <button
            onClick={() => onApprove(invoice.id)}
            className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-teal-600/20 text-teal-400 border border-teal-600/30 hover:bg-teal-600/30 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => onReject(invoice.id)}
            className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-red-600/10 text-red-500 border border-red-600/20 hover:bg-red-600/20 transition-colors"
          >
            Reject
          </button>
        </div>
      )}

      {/* Prior payments */}
      <div className="flex items-center gap-3 mt-2 text-xs text-zinc-600">
        <span className="font-mono">{invoice.date}</span>
        {invoice.prior_payments > 0 && (
          <>
            <span>·</span>
            <span>{invoice.prior_payments} prior payments</span>
          </>
        )}
        {invoice.decided_by && (
          <>
            <span>·</span>
            <span>decided by <span className="text-zinc-500">{invoice.decided_by}</span></span>
          </>
        )}
      </div>
    </div>
  )
}

function GuardrailToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors ${value ? 'bg-amber-500' : 'bg-zinc-700'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </button>
      <div>
        <div className="text-xs font-medium text-zinc-200">{label}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{description}</div>
      </div>
    </div>
  )
}

function TxRow({ tx }: { tx: TxEntry }) {
  return (
    <div className="px-5 py-3 hover:bg-zinc-800/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-300 truncate">{tx.vendor}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${tx.initiated_by === 'agent' ? 'bg-blue-500/10 text-blue-400' : 'bg-teal-500/10 text-teal-400'}`}>
              {tx.initiated_by}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-xs text-zinc-600">{tx.id}</span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono text-xs text-zinc-600">{tx.timestamp}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm text-red-400 font-semibold">
            −£{tx.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="font-mono text-xs text-zinc-500 mt-0.5">
            £{tx.balance_after.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const actionColors: Record<string, string> = {
    auto_paid: 'text-emerald-400',
    escalated: 'text-red-400',
    approved: 'text-teal-400',
    rejected: 'text-zinc-500',
  }

  return (
    <div className="px-5 py-3 hover:bg-zinc-800/30 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-xs text-zinc-500">{entry.timestamp}</span>
        <span className={`text-xs font-semibold ${actionColors[entry.action] ?? 'text-zinc-400'}`}>
          {entry.action.replace('_', ' ')}
        </span>
        <span className="ml-auto text-xs text-zinc-600">{entry.decided_by}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-300 font-medium">{entry.vendor}</span>
        <span className="text-xs font-mono text-zinc-400">
          £{entry.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </span>
      </div>
      <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{entry.reason}</p>
    </div>
  )
}
