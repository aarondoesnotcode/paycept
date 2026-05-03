# Paycept

An autonomous accounts-payable agent that triages invoices, auto-pays the safe ones, and escalates the rest with a full audit trail.

## Overview

Every incoming invoice lands in Paycept's queue before any money moves. A rules-based agent runs guardrail checks — vendor history, threshold limits, duplicate detection, splitting attempts — and enriches each vendor with Specter data. Clean invoices are auto-paid against a simulated treasury and debited in real time. Anything ambiguous is held for human approval with a reason and a confidence score. Nothing leaves the account without either a clean rule set or an explicit human click.

## Highlights

- **Real money simulation** — every auto-pay debits an in-memory treasury you can resize on the fly, with a live ledger of every transaction
- **Layered guardrails** — new-vendor, above-threshold, duplicate, large-first-invoice, and invoice-splitting checks run pre-LLM in milliseconds
- **Soft signals** — round-number detection only contributes when other risks fire, so it doesn't escalate legitimate retainers
- **Specter enrichment** — every vendor gets a real risk score; high-risk or unknown vendors override clean rule outcomes
- **Document upload** — drop a CSV, PDF, or image; CSVs parse instantly, PDFs and images route through Claude Sonnet 4 Vision
- **Editable thresholds** — auto-pay limit, slider range, and starting treasury balance are all click-to-edit, persisted to the backend
- **Human-in-the-loop** — escalated invoices get Approve / Reject buttons; both actions hit the audit log with `decided_by: human`
- **Immutable audit log** — every agent decision and human override stamped with timestamp, vendor, amount, and reason

## Architecture

| Layer | Stack | Role |
|---|---|---|
| UI | Next.js 16 App Router · React 19 · Tailwind 4 | Dark dashboard, hero, drag-drop upload, live treasury |
| API | Next.js Route Handlers | `/triage`, `/upload`, `/approve`, `/reject`, `/guardrails`, `/treasury`, `/reset` |
| Agent | Pure TypeScript rules engine (`lib/agent.ts`) | Pre-flight guardrails + Specter overrides, no LLM in the decision path |
| Extraction | Claude Sonnet 4 (`@anthropic-ai/sdk`) + native CSV parser | PDF/image → structured invoice fields |
| Enrichment | Specter API (`api.specterdata.com`) | Vendor registration + risk score |
| State | In-memory module singletons | Invoices, audit log, treasury, guardrails — resets on server restart |

## Quickstart

### Prerequisites

- Node.js 20+
- An Anthropic API key (only needed for PDF/image upload — CSV works without)
- A Specter API key (provided in `.env.local`)

### Install

```bash
npm install
```

### Configure

Edit `.env.local`:

```bash
SPECTER_API_KEY=your_specter_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo

Drop this CSV into the upload zone, then click **Run triage**:

```csv
vendor,amount,date,invoice_no
Acme Catering,499,2026-04-30,A-001
Acme Catering,495,2026-04-30,A-002
Acme Catering,490,2026-04-30,A-003
NewSupplier Ltd,12000,2026-04-30,N-001
Stripe Inc,5000,2026-04-30,S-001
Random Co,5000,2026-04-30,R-001
```

| Invoice | Outcome | Why |
|---|---|---|
| Acme £499, £495, £490 | Escalated | `invoice_splitting` — three sub-threshold invoices summing to £1,484 |
| NewSupplier £12,000 | Escalated | `new_vendor` + `large_first_invoice` + `above_threshold` |
| Stripe £5,000 | Escalated | `above_threshold` + `round_number` (round joins because other flags fired) |
| Random Co £5,000 | Escalated | `above_threshold` only — round number alone is no longer a trigger |

## Tech Stack

| Frontend | Backend | AI / Data |
|---|---|---|
| Next.js 16 (App Router) | Next.js Route Handlers | Claude Sonnet 4 (vision) |
| React 19 | TypeScript | Specter API (vendor risk) |
| Tailwind CSS 4 | In-memory store | — |

## Project Structure

<details>
<summary>Click to expand</summary>

```
paycept/
├── app/
│   ├── api/
│   │   ├── triage/        # GET state · POST runs the agent
│   │   ├── upload/        # POST extracts invoices from CSV/PDF/image
│   │   ├── approve/       # POST human approval
│   │   ├── reject/        # POST human rejection
│   │   ├── guardrails/    # PUT live guardrail config
│   │   ├── treasury/      # PUT starting balance
│   │   └── reset/         # POST resets queue + ledger
│   ├── page.tsx           # Hero, dashboard, all UI
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── agent.ts           # Triage logic + flag checks
│   ├── invoices.ts        # In-memory store + addInvoices helper
│   ├── treasury.ts        # Balance, ledger, debit/setStartingBalance
│   ├── specter.ts         # Vendor enrichment
│   ├── extract.ts         # CSV parser + Claude vision extractor
│   └── types.ts           # Shared types
└── .env.local             # SPECTER_API_KEY, ANTHROPIC_API_KEY
```

</details>

## Notes

State is in-memory by design — restart the dev server and the queue, ledger, and guardrails reset. No database, no auth, no real payment rails.
