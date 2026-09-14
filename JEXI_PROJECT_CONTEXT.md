# JEXI PROJECT CONTEXT & ARCHITECTURAL SPECIFICATION

## Project Identity
- **Product Name**: Jexi
- **Tagline**: Focused Self-Custody Crypto Payment Memory & Transaction-Preparation Tool
- **Primary Problem**: Manual recurring payments are easily forgotten or prone to address errors, while automated smart-contract subscriptions remove user control and introduce security vulnerabilities.
- **Solution**: Jexi remembers payment intentions, alerts when payments are due, runs deterministic preflight safety checks, and prepares unsigned transaction payloads for physical hardware approval.

## Core Philosophy & Boundaries
1. **Never custody private keys or seed phrases.**
2. **Never claim automatic or AI-driven signing authority.**
3. **No fabricated states**: A payment intention is NOT a transaction. Only on-chain confirmed receipts become completed transaction records.
4. **Transparent deterministic preflight rules**:
   - Address format validation (EVM hexadecimal & EIP-55 checksum)
   - Profile matching against saved Recipient Directory
   - Target network consistency (Base Sepolia)
   - Asset/token configuration & decimals
   - Anomaly detection (e.g. flagging payments exceeding 300% of baseline profile)
   - Balance sufficiency check
5. **Clear Development Simulation Labeling**:
   - Development testnet mode is always explicitly tagged with amber warning badges and never presented as genuine Ledger hardware signing.

## Data Models
- **Recipient**: `id`, `name`, `address`, `networkId`, `tokenSymbol`, `defaultAmount`, `notes`, `createdAt`
- **PaymentIntention**: `id`, `recipientId`, `amount`, `tokenSymbol`, `networkId`, `frequency`, `nextDueDate`, `notes`, `active`
- **PreparedTransaction**: `id`, `intentionId`, `recipientAddress`, `amount`, `tokenSymbol`, `networkId`, `rawCalldata`, `preflightReport`, `status: PaymentLifecycleState`
- **CompletedTransactionRecord**: `id`, `preparedTxId`, `intentionId`, `recipientId`, `recipientName`, `recipientAddress`, `amount`, `tokenSymbol`, `networkId`, `txHash`, `confirmedAt`, `isSimulation`
