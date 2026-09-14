import { isAddress, getAddress, encodeFunctionData, parseUnits, parseAbi } from 'viem';
import { Recipient, PaymentIntention, PreflightReport, PreflightCheckItem, PreflightStatus, PreparedTransaction, TokenConfig } from '../types';
import { SUPPORTED_TOKENS, SUPPORTED_NETWORKS } from '../constants';
import { loadTestnetBalance } from '../storage/storage';

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export function runPreflightChecks(
  recipient: Recipient,
  intention: PaymentIntention,
  token: TokenConfig,
  currentPreparedAddress: string,
  currentPreparedAmount: number
): PreflightReport {
  const checks: PreflightCheckItem[] = [];

  // 1. Address Format Verification
  const isHex40 = /^0x[0-9a-fA-F]{40}$/.test(currentPreparedAddress);
  if (!isHex40) {
    checks.push({
      id: 'chk_addr_format',
      title: 'Address Format Check',
      description: 'Verifies standard 42-character hexadecimal EVM address structure.',
      status: 'BLOCKED',
      details: `Invalid Ethereum address format: ${currentPreparedAddress.substring(0, 10)}... (must be 0x followed by 40 hex characters)`,
    });
  } else {
    try {
      const checksummed = getAddress(currentPreparedAddress);
      checks.push({
        id: 'chk_addr_format',
        title: 'Address Format Check',
        description: 'Standard 42-character EVM address with EIP-55 checksum validation.',
        status: 'PASS',
        details: `Address verified: ${checksummed.substring(0, 8)}...${checksummed.substring(checksummed.length - 6)}`,
      });
    } catch {
      checks.push({
        id: 'chk_addr_format',
        title: 'Address Format Check',
        description: 'Address format is valid hex but checksum case evaluation failed.',
        status: 'WARNING',
        details: 'Address format is valid 40-hex bytes but casing requires attention.',
      });
    }
  }

  // 2. Recipient Directory Match
  if (recipient) {
    if (recipient.address.toLowerCase() === currentPreparedAddress.toLowerCase()) {
      checks.push({
        id: 'chk_recip_match',
        title: 'Recipient Profile Match',
        description: 'Target address matches saved profile in Recipient Book.',
        status: 'PASS',
        details: `Matched verified recipient "${recipient.name}" (${recipient.address.substring(0, 8)}...)`,
      });
    } else {
      checks.push({
        id: 'chk_recip_match',
        title: 'Recipient Profile Mismatch',
        description: 'Prepared address differs from the saved recipient address.',
        status: 'BLOCKED',
        details: `Saved profile expects ${recipient.address.substring(0, 8)}... but transaction targets ${currentPreparedAddress.substring(0, 8)}...`,
      });
    }
  } else {
    checks.push({
      id: 'chk_recip_match',
      title: 'Recipient Profile Verification',
      description: 'Recipient profile not registered in Recipient Book.',
      status: 'WARNING',
      details: 'Recipient profile not found in local book. Verify address before proceeding.',
    });
  }

  // 3. Network Match Check
  const network = SUPPORTED_NETWORKS[intention.networkId];
  if (network && network.id === 'base-sepolia') {
    checks.push({
      id: 'chk_net_match',
      title: 'Network Consistency Check',
      description: 'Target execution environment is confirmed as Base Sepolia testnet.',
      status: 'PASS',
      details: `Chain ID: ${network.chainId} (Base Sepolia)`,
    });
  } else {
    checks.push({
      id: 'chk_net_match',
      title: 'Network Consistency Check',
      description: 'Unrecognized or unsupported target network.',
      status: 'BLOCKED',
      details: `Network ID: ${intention.networkId}`,
    });
  }

  // 4. Token & Decimals Check
  if (token) {
    checks.push({
      id: 'chk_token_match',
      title: 'Token Configuration Check',
      description: `Matched token configuration for ${token.symbol}.`,
      status: 'PASS',
      details: `${token.name} with ${token.decimals} decimals. Contract: ${token.contractAddress.substring(0, 10)}...`,
    });
  } else {
    checks.push({
      id: 'chk_token_match',
      title: 'Token Configuration Check',
      description: 'Token definition missing.',
      status: 'BLOCKED',
      details: `Token symbol: ${intention.tokenSymbol}`,
    });
  }

  // 5. Amount Anomaly Check
  if (currentPreparedAmount <= 0) {
    checks.push({
      id: 'chk_amount_valid',
      title: 'Amount Validation',
      description: 'Payment amount must be strictly greater than 0.',
      status: 'BLOCKED',
      details: `Current amount: ${currentPreparedAmount}`,
    });
  } else if (recipient && recipient.defaultAmount && recipient.defaultAmount > 0) {
    const ratio = currentPreparedAmount / recipient.defaultAmount;
    if (ratio >= 3) {
      checks.push({
        id: 'chk_amount_anomaly',
        title: 'Amount Anomaly Warning',
        description: 'Payment amount is unusually high compared to usual baseline.',
        status: 'WARNING',
        details: `Payment of ${currentPreparedAmount} ${token?.symbol || ''} is ${(ratio * 100).toFixed(0)}% of standard baseline (${recipient.defaultAmount} ${token?.symbol || ''}).`,
      });
    } else {
      checks.push({
        id: 'chk_amount_anomaly',
        title: 'Amount Normalcy Check',
        description: 'Payment amount is consistent with baseline profile.',
        status: 'PASS',
        details: `Amount (${currentPreparedAmount} ${token?.symbol || ''}) is within normal parameters.`,
      });
    }
  } else {
    checks.push({
      id: 'chk_amount_anomaly',
      title: 'Amount Anomaly Check',
      description: 'Baseline amount comparison.',
      status: 'PASS',
      details: `Standard amount: ${currentPreparedAmount} ${token?.symbol || ''}`,
    });
  }

  // 6. Testnet Balance & Self-Custody Verification
  const balances = loadTestnetBalance();
  const tokenKey = (token?.symbol || 'Test USDC') as keyof typeof balances;
  const available = balances[tokenKey] ?? 0;
  if (available < currentPreparedAmount) {
    checks.push({
      id: 'chk_balance',
      title: 'Testnet Allocation Notice',
      description: 'Available testnet simulation allocation is lower than required transfer amount.',
      status: 'WARNING',
      details: `Available: ${available.toLocaleString()} ${token?.symbol} | Required: ${currentPreparedAmount.toLocaleString()} ${token?.symbol}. In self-custody mode, your hardware wallet will verify live on-chain balance prior to signing.`,
    });
  } else {
    checks.push({
      id: 'chk_balance',
      title: 'Balance & Custody Verification',
      description: 'Sufficient balance available in local testnet allocation.',
      status: 'PASS',
      details: `Available: ${available.toLocaleString()} ${token?.symbol} (Sufficient for ${currentPreparedAmount} ${token?.symbol}). Final on-chain balance confirmed by hardware wallet upon authorization.`,
    });
  }

  // Determine overall status
  const hasBlocked = checks.some((c) => c.status === 'BLOCKED');
  const hasWarning = checks.some((c) => c.status === 'WARNING');
  const overallStatus: PreflightStatus = hasBlocked ? 'BLOCKED' : hasWarning ? 'WARNING' : 'PASS';

  return {
    overallStatus,
    checks,
    timestamp: new Date().toISOString(),
    canProceed: !hasBlocked,
  };
}

export function prepareUnsignedTransaction(
  recipient: Recipient,
  intention: PaymentIntention
): PreparedTransaction {
  const token = SUPPORTED_TOKENS.find((t) => t.symbol === intention.tokenSymbol) || SUPPORTED_TOKENS[0];
  const preflightReport = runPreflightChecks(
    recipient,
    intention,
    token,
    recipient.address,
    intention.amount
  );

  let rawCalldata = '0x';
  let value = '0';

  if (token.symbol === 'Test ETH') {
    value = parseUnits(intention.amount.toString(), 18).toString();
    rawCalldata = '0x'; // Native ETH transfer
  } else {
    try {
      const rawUnits = parseUnits(intention.amount.toString(), token.decimals);
      rawCalldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient.address as `0x${string}`, rawUnits],
      });
    } catch {
      rawCalldata = '0xa9059cbb...[calldata encoding error]';
    }
  }

  return {
    id: `prep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    intentionId: intention.id,
    recipientId: recipient.id,
    recipientName: recipient.name,
    recipientAddress: recipient.address,
    amount: intention.amount,
    tokenSymbol: intention.tokenSymbol,
    networkId: intention.networkId,
    value,
    rawCalldata,
    estimatedGas: '0.000045 ETH (~$0.12 testnet gas)',
    preflightReport,
    status: 'ready_for_review',
    executionMode: 'DEVELOPMENT_TESTNET_SIMULATION',
  };
}

// Generate clear simulated reference identifier (never masquerades as a verified on-chain tx hash)
export function generateSimulatedTxHash(): string {
  const randPart = Math.random().toString(16).substring(2, 8).toUpperCase();
  const timePart = Date.now().toString(16).substring(4).toUpperCase();
  return `SIM-BASE-SEP-${randPart}${timePart}`;
}
