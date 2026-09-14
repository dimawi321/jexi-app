# CHANGELOG

## [0.1.0] - Foundational MVP Release

### Added
- **Core Architecture & Types**: Modular interfaces for recipients, payment intentions, preflight reports, prepared transactions, and completed records.
- **Dashboard**: Today's date banner, due payment highlights with direct preparation triggers, and 7-day upcoming queue.
- **Recipient Directory**: Add, edit, delete, and copy verified recipient profiles with target network (Base Sepolia) and token configurations.
- **Payment Intentions**: Recurring cadence scheduler (monthly, weekly, bi-weekly, custom, one-time) with due date tracking.
- **Interactive Calendar**: Monthly view with payment indicator dots and day-by-day inspection.
- **Deterministic Preflight Engine**: 6-point verification (Address format, recipient profile match, network match, token decimals, amount anomaly warning, testnet balance sufficiency).
- **Transaction Preparation Screen**: Displays unsigned payloads, inspectable raw EVM calldata, gas estimate, and preflight status badges (PASS / WARNING / BLOCKED).
- **Development Testnet Simulation Mode**: Explicitly badged simulation pipeline (`Ready for Review` → `Simulated Signed` → `Simulated Broadcast` → `Simulated Confirmed`) with auto-advancing next due dates.
- **Recipient-Specific Transaction History**: Filterable history view showing simulated testnet confirmations and BaseScan links.
- **Client Persistence**: Durable browser `localStorage` engine with zero external paid dependencies.
