/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SigningRequest {
  preparedTxId: string;
  occurrenceId: string;
  intentId: string;
  recipientName: string;
  recipientAddress: `0x${string}`;
  networkId: string;
  networkName: string;
  tokenSymbol: string;
  amount: number;
  signerAddress: `0x${string}`;
  rawCalldata: `0x${string}`;
  value?: string;
  estimatedGas: string;
}

export type SignerType = 'simulated_ledger' | 'metamask_browser' | 'hardware_ledger_device';

export interface SignatureResult {
  success: boolean;
  signerType: SignerType;
  signature?: `0x${string}`;
  status: 'AUTHORIZED' | 'REJECTED' | 'FAILED';
  summaryMessage: string;
  timestamp: string;
  isSimulated: boolean;
  error?: string;
}

export interface ISignerAdapter {
  id: string;
  name: string;
  isSimulated: boolean;
  signTransaction(
    request: SigningRequest,
    onProgress?: (step: string, percent: number) => void
  ): Promise<SignatureResult>;
}

/**
 * SIMULATED LEDGER SIGNER ADAPTER
 * 
 * Demonstrates SIGNA's intended Ledger signing architecture:
 * SIGNA prepares transaction proposal -> human reviews & approves -> Ledger signing interface -> Ledger authorizes -> signed transaction result.
 * 
 * Future Integration Point:
 * To replace this simulated adapter with a physical Ledger device (e.g. via @ledgerhq/hw-app-eth or WebHID/WebUSB),
 * create `RealLedgerSignerAdapter` implementing `ISignerAdapter` and swap instances in the SignerFactory.
 */
export class SimulatedLedgerSignerAdapter implements ISignerAdapter {
  readonly id = 'simulated_ledger';
  readonly name = 'Ledger Signer (Simulated Demo)';
  readonly isSimulated = true;

  async signTransaction(
    request: SigningRequest,
    onProgress?: (step: string, percent: number) => void
  ): Promise<SignatureResult> {
    try {
      // Step 1: Preparing signature
      onProgress?.('Preparing signature...', 25);
      await new Promise((r) => setTimeout(r, 600));

      // Step 2: Verifying transaction payload
      onProgress?.('Verifying transaction payload...', 50);
      await new Promise((r) => setTimeout(r, 700));

      // Step 3: Signature approved
      onProgress?.('Signature approved on simulated signer.', 75);
      await new Promise((r) => setTimeout(r, 500));

      // Step 4: Authorization complete
      onProgress?.('Authorization complete.', 100);

      // Generate a deterministic authorization signature derived from transaction parameters
      // Note: No private key or seed phrase is ever used, held, or generated.
      const seedString = `${request.preparedTxId}_${request.occurrenceId}_${request.signerAddress}_${request.amount}`;
      let hashHex = '0x';
      for (let i = 0; i < seedString.length; i++) {
        const charCode = seedString.charCodeAt(i);
        hashHex += ((charCode * 31 + i * 17) % 256).toString(16).padStart(2, '0');
      }
      // Pad to standard 130 hex characters (r, s, v signature format)
      const deterministicSig = (hashHex + '1c' + '00'.repeat(65)).substring(0, 132) as `0x${string}`;

      return {
        success: true,
        signerType: 'simulated_ledger',
        signature: deterministicSig,
        status: 'AUTHORIZED',
        summaryMessage: 'The transaction has been authorized by the simulated Ledger signer.',
        timestamp: new Date().toISOString(),
        isSimulated: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Simulated Ledger authorization failed.';
      return {
        success: false,
        signerType: 'simulated_ledger',
        status: 'FAILED',
        summaryMessage: msg,
        timestamp: new Date().toISOString(),
        isSimulated: true,
        error: msg,
      };
    }
  }
}

/**
 * SIGNER FACTORY
 * Factory pattern for instantiating the appropriate signer adapter.
 */
export class SignerFactory {
  static getAdapter(type: SignerType = 'simulated_ledger'): ISignerAdapter {
    switch (type) {
      case 'simulated_ledger':
        return new SimulatedLedgerSignerAdapter();
      // Future Hardware Adapter Registration Point:
      // case 'hardware_ledger_device':
      //   return new RealLedgerSignerAdapter();
      default:
        return new SimulatedLedgerSignerAdapter();
    }
  }
}
