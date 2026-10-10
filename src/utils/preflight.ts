import { isAddress, getAddress, encodeFunctionData, parseUnits, parseAbi, formatUnits } from 'viem';
import { Recipient, PaymentIntention, PreflightReport, PreflightCheckItem, PreflightStatus, PreparedTransaction, TokenConfig } from '../types';
import { SUPPORTED_TOKENS, SUPPORTED_NETWORKS, BASE_MAINNET_CHAIN_ID, formatTokenSymbol } from '../constants';
import { ConnectedWalletBalance } from '../lib/balance';
import { getOccurrenceId } from './scheduler';

export interface PreflightWalletContext {
  walletState?: {
    isConnected: boolean;
    address: string | null;
    chainId: number | null;
    providerName?: string | null;
    isWrongNetwork?: boolean;
  } | null;
  liveBalance?: ConnectedWalletBalance | null;
}

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export function runPreflightChecks(
  recipient: Recipient | undefined | null,
  intention: PaymentIntention,
  token: TokenConfig,
  currentPreparedAddress: string,
  currentPreparedAmount: number,
  walletContext?: PreflightWalletContext
): PreflightReport {
  const checks: PreflightCheckItem[] = [];

  // 1. Active Intention Status Check (Authoritative Source of Truth)
  if (!intention || !intention.id) {
    checks.push({
      id: 'chk_active_status',
      title: 'Intention Source Integrity',
      description: 'Scheduled payment intention must exist as an authoritative record.',
      status: 'BLOCKED',
      details: 'Missing or corrupt intention record. Transactions can only be prepared from an authoritative intention.',
    });
  } else if (
    intention.isRejected ||
    (intention.frequency === 'once' && (intention.isRejected || !!intention.rejectedAt))
  ) {
    checks.push({
      id: 'chk_active_status',
      title: 'Intention Status Check',
      description: 'One-time payment intention has been rejected.',
      status: 'BLOCKED',
      details: 'This one-time payment intention has been rejected. Rejected payments are terminal and cannot be prepared, authorized, or executed again.',
    });
  } else if (
    intention.isCompleted ||
    (intention.frequency === 'once' && (intention.isCompleted || !!intention.completedAt))
  ) {
    checks.push({
      id: 'chk_active_status',
      title: 'Intention Status Check',
      description: 'One-time payment intention has already been completed.',
      status: 'BLOCKED',
      details: 'This one-time payment intention has already completed its lifecycle. Completed one-time payments are terminal and cannot be prepared, authorized, or executed again.',
    });
  } else if (!intention.active) {
    checks.push({
      id: 'chk_active_status',
      title: 'Intention Status Check',
      description: 'Scheduled payment intention must be active to proceed.',
      status: 'BLOCKED',
      details: 'Intention is currently paused or inactive. Active status is required before transaction preparation or authorization can proceed.',
    });
  } else {
    checks.push({
      id: 'chk_active_status',
      title: 'Intention Status Check',
      description: 'Scheduled intention is active.',
      status: 'PASS',
      details: `Payment intention (${intention.id}) is confirmed active in scheduling memory.`,
    });
  }

  // 2. Recipient Directory & Address Integrity
  if (!recipient) {
    checks.push({
      id: 'chk_recip_match',
      title: 'Recipient Profile Check',
      description: 'Target recipient must exist in Recipient Book.',
      status: 'BLOCKED',
      details: 'Recipient profile not found in Recipient Book. Cannot prepare transaction for unverified recipient.',
    });
  } else if (!intention?.recipientId || recipient.id !== intention.recipientId) {
    checks.push({
      id: 'chk_recip_match',
      title: 'Recipient Profile Integrity',
      description: 'Prepared recipient must match scheduled intention.',
      status: 'BLOCKED',
      details: `Recipient mismatch: prepared recipient (${recipient.name || recipient.id}) does not match intention recipient (${intention?.recipientId || 'none'}).`,
    });
  } else if (!currentPreparedAddress || recipient.address.toLowerCase() !== currentPreparedAddress.toLowerCase()) {
    checks.push({
      id: 'chk_recip_match',
      title: 'Recipient Address Integrity',
      description: 'Destination address must match the verified address in Recipient Book.',
      status: 'BLOCKED',
      details: `Recipient mismatch: the prepared destination address (${(currentPreparedAddress || 'empty').substring(0, 10)}...) does not match the address saved in Recipient Book (${recipient.address.substring(0, 10)}...).`,
    });
  } else {
    checks.push({
      id: 'chk_recip_match',
      title: 'Recipient Directory Match',
      description: 'Target address matches verified profile in Recipient Book.',
      status: 'PASS',
      details: `Matched verified recipient "${recipient.name}" (${recipient.address.substring(0, 8)}...${recipient.address.substring(recipient.address.length - 6)}).`,
    });
  }

  // 3. Address Hex & Checksum Format Check
  const isHex40 = /^0x[0-9a-fA-F]{40}$/.test(currentPreparedAddress);
  if (!isHex40) {
    checks.push({
      id: 'chk_addr_format',
      title: 'Address Format Check',
      description: 'Verifies standard 42-character hexadecimal EVM address structure.',
      status: 'BLOCKED',
      details: `Invalid Ethereum address format: ${currentPreparedAddress.substring(0, 10)}... (must be 0x followed by 40 hex characters).`,
    });
  } else {
    try {
      const checksummed = getAddress(currentPreparedAddress);
      checks.push({
        id: 'chk_addr_format',
        title: 'Address Format Check',
        description: 'Standard 42-character EVM address with EIP-55 checksum validation.',
        status: 'PASS',
        details: `Address verified: ${checksummed.substring(0, 8)}...${checksummed.substring(checksummed.length - 6)}.`,
      });
    } catch {
      checks.push({
        id: 'chk_addr_format',
        title: 'Address Checksum Warning',
        description: 'Address format is valid hex but checksum case evaluation failed.',
        status: 'WARNING',
        details: 'Address format is valid 40-hex bytes but casing requires attention before hardware authorization.',
      });
    }
  }

  // 4. Network Consistency & Intention Match
  const network = SUPPORTED_NETWORKS[intention.networkId];
  if (!network || network.id !== 'base-mainnet') {
    checks.push({
      id: 'chk_net_match',
      title: 'Network Integrity Check',
      description: 'Target execution environment must match supported Base network.',
      status: 'BLOCKED',
      details: `Network mismatch: the prepared transaction network (${intention.networkId}) is not supported or does not match Base.`,
    });
  } else {
    checks.push({
      id: 'chk_net_match',
      title: 'Network Consistency Check',
      description: `Target execution environment is confirmed as ${network.name}.`,
      status: 'PASS',
      details: `Chain ID: ${network.chainId} (${network.name}) matches intention network.`,
    });
  }

  // 5. Token Configuration & Asset Integrity
  if (!token || !SUPPORTED_TOKENS.some((t) => t.symbol === token.symbol)) {
    checks.push({
      id: 'chk_token_match',
      title: 'Token Configuration Check',
      description: 'Token definition missing or unsupported.',
      status: 'BLOCKED',
      details: `Token symbol: ${intention.tokenSymbol} is not supported.`,
    });
  } else if (token.symbol !== intention.tokenSymbol) {
    checks.push({
      id: 'chk_token_match',
      title: 'Asset Integrity Check',
      description: 'Prepared token must match the scheduled intention token.',
      status: 'BLOCKED',
      details: `Asset mismatch: the prepared transaction uses ${token.symbol}, but this intention is scheduled for ${intention.tokenSymbol}.`,
    });
  } else {
    checks.push({
      id: 'chk_token_match',
      title: 'Token Configuration Check',
      description: `Matched token configuration for ${token.symbol}.`,
      status: 'PASS',
      details: `${token.name} (${token.symbol}) with ${token.decimals} decimals matches intention asset. Contract: ${token.contractAddress.substring(0, 10)}...`,
    });
  }

  // 6. Amount Integrity & Intention Amount Deviation Check
  if (currentPreparedAmount <= 0) {
    checks.push({
      id: 'chk_amount_valid',
      title: 'Amount Validation',
      description: 'Payment amount must be strictly greater than 0.',
      status: 'BLOCKED',
      details: `Current amount: ${currentPreparedAmount} (Must be a positive number).`,
    });
  } else if (currentPreparedAmount === intention.amount) {
    checks.push({
      id: 'chk_amount_intention',
      title: 'Intention Amount Match',
      description: 'Prepared payment amount matches the scheduled intention.',
      status: 'PASS',
      details: `Amount: ${currentPreparedAmount.toLocaleString()} ${token?.symbol || intention.tokenSymbol} (Matches scheduled intention exactly).`,
    });
  } else {
    const diff = currentPreparedAmount - intention.amount;
    const pctChange = ((diff / intention.amount) * 100).toFixed(1);
    const sign = diff > 0 ? '+' : '';
    checks.push({
      id: 'chk_amount_intention',
      title: 'Intention Amount Deviation',
      description: 'Prepared payment amount differs from scheduled intention.',
      status: 'WARNING',
      details: `Amount changed: prepared payment is ${currentPreparedAmount.toLocaleString()} ${token?.symbol || intention.tokenSymbol}, while the scheduled intention is ${intention.amount.toLocaleString()} ${token?.symbol || intention.tokenSymbol} (${sign}${pctChange}%).`,
    });
  }

  // 7. Historical Baseline Anomaly Check (Preserved Separate Signal)
  if (currentPreparedAmount > 0 && recipient && recipient.defaultAmount && recipient.defaultAmount > 0) {
    const ratio = currentPreparedAmount / recipient.defaultAmount;
    if (ratio >= 3) {
      checks.push({
        id: 'chk_amount_anomaly',
        title: 'Historical Baseline Anomaly Warning',
        description: 'Payment amount is unusually high compared to usual baseline.',
        status: 'WARNING',
        details: `Payment of ${currentPreparedAmount.toLocaleString()} ${token?.symbol || ''} is ${(ratio * 100).toFixed(0)}% of standard baseline (${recipient.defaultAmount.toLocaleString()} ${token?.symbol || ''}).`,
      });
    } else {
      checks.push({
        id: 'chk_amount_anomaly',
        title: 'Historical Baseline Check',
        description: 'Payment amount is consistent with baseline profile.',
        status: 'PASS',
        details: `Amount (${currentPreparedAmount.toLocaleString()} ${token?.symbol || ''}) is within normal baseline parameters.`,
      });
    }
  } else if (currentPreparedAmount > 0) {
    checks.push({
      id: 'chk_amount_anomaly',
      title: 'Historical Baseline Check',
      description: 'Baseline amount comparison.',
      status: 'PASS',
      details: `No recipient baseline override configured. Standard amount: ${currentPreparedAmount.toLocaleString()} ${token?.symbol || ''}`,
    });
  }

  // 8. Live On-Chain Balance Verification (Connected Wallet Authority)
  const networkName = network?.name || 'Base';
  const targetChainId = network?.chainId || BASE_MAINNET_CHAIN_ID;
  const decimals = token?.decimals ?? 6;

  if (!walletContext?.walletState?.isConnected || !walletContext?.walletState?.address) {
    checks.push({
      id: 'chk_balance',
      title: 'Wallet Connection Required for Live Balance',
      description: 'Live on-chain USDC verification requires an active connected wallet.',
      status: 'BLOCKED',
      details: `No wallet connected. Please connect your MetaMask wallet on ${networkName} to verify live on-chain USDC balance and proceed with authorization.`,
    });
  } else if (
    walletContext.walletState.chainId &&
    walletContext.walletState.chainId !== targetChainId
  ) {
    checks.push({
      id: 'chk_balance',
      title: 'Wallet Network Mismatch',
      description: `Connected wallet is on Chain ID ${walletContext.walletState.chainId}, but intention requires ${networkName} (Chain ID ${targetChainId}).`,
      status: 'BLOCKED',
      details: `Please switch your wallet network to ${networkName} in MetaMask to verify live balance and authorize this payment.`,
    });
  } else if (walletContext.liveBalance?.status === 'loading') {
    checks.push({
      id: 'chk_balance',
      title: 'Verifying Live USDC Balance...',
      description: 'Querying blockchain for connected wallet on-chain balance.',
      status: 'BLOCKED',
      details: `Querying live on-chain USDC balance on ${networkName} for ${walletContext.walletState.address.slice(0, 6)}...${walletContext.walletState.address.slice(-4)}. Transaction authorization is held until verification completes.`,
    });
  } else if (
    !walletContext.liveBalance ||
    walletContext.liveBalance.status === 'unavailable' ||
    walletContext.liveBalance.status === 'disconnected'
  ) {
    const errorReason = walletContext.liveBalance?.error || 'RPC timeout or network error';
    checks.push({
      id: 'chk_balance',
      title: 'Unable to Verify Live USDC Balance',
      description: 'Blockchain balance query failed or network is unreachable.',
      status: 'BLOCKED',
      details: `Failed to read on-chain USDC balance for ${walletContext.walletState.address.slice(0, 6)}...${walletContext.walletState.address.slice(-4)} on ${networkName} (${errorReason}). Transaction authorization blocked for safety.`,
    });
  } else {
    // Exact token unit calculation
    let rawBalance: bigint;
    if (walletContext.liveBalance.raw !== undefined && walletContext.liveBalance.raw !== null) {
      rawBalance = walletContext.liveBalance.raw;
    } else if (walletContext.liveBalance.usdc !== null) {
      rawBalance = parseUnits(walletContext.liveBalance.usdc.toFixed(decimals), decimals);
    } else {
      rawBalance = 0n;
    }

    // Required amount converted to raw integer units
    let requiredUnits: bigint;
    try {
      requiredUnits = parseUnits(currentPreparedAmount.toFixed(decimals), decimals);
    } catch {
      requiredUnits = parseUnits(currentPreparedAmount.toString(), decimals);
    }

    const isSufficient = rawBalance >= requiredUnits;
    const formattedBalance = formatUnits(rawBalance, decimals);
    const formattedRequired = formatUnits(requiredUnits, decimals);

    if (!isSufficient) {
      const deficitUnits = requiredUnits - rawBalance;
      const formattedDeficit = formatUnits(deficitUnits, decimals);
      checks.push({
        id: 'chk_balance',
        title: 'Insufficient Live USDC Balance',
        description: 'Connected wallet on-chain balance is less than required payment amount.',
        status: 'BLOCKED',
        details: `Available on-chain: ${formattedBalance} ${formatTokenSymbol(token.symbol)} | Required: ${formattedRequired} ${formatTokenSymbol(token.symbol)} on ${networkName}. Deficit: ${formattedDeficit} ${formatTokenSymbol(token.symbol)}. Transaction cannot proceed without sufficient funds.`,
      });
    } else {
      checks.push({
        id: 'chk_balance',
        title: 'Live On-Chain USDC Balance Verified',
        description: `Sufficient on-chain ${formatTokenSymbol(token.symbol)} balance verified on ${networkName}.`,
        status: 'PASS',
        details: `Verified on-chain: ${formattedBalance} ${formatTokenSymbol(token.symbol)} (Sufficient for ${formattedRequired} ${formatTokenSymbol(token.symbol)} payment) for ${walletContext.walletState.address.slice(0, 6)}...${walletContext.walletState.address.slice(-4)}. Contract: ${token.contractAddress}.`,
      });
    }
  }

  // Determine overall status based on strict severity hierarchy
  const hasBlocked = checks.some((c) => c.status === 'BLOCKED');
  const hasWarning = checks.some((c) => c.status === 'WARNING');
  const hasInfo = checks.some((c) => c.status === 'INFO');
  const overallStatus: PreflightStatus = hasBlocked
    ? 'BLOCKED'
    : hasWarning
    ? 'WARNING'
    : hasInfo
    ? 'INFO'
    : 'PASS';

  return {
    overallStatus,
    checks,
    timestamp: new Date().toISOString(),
    canProceed: !hasBlocked,
  };
}

export function prepareUnsignedTransaction(
  recipient: Recipient | undefined | null,
  intention: PaymentIntention,
  connectedWalletAddress?: string | null,
  walletProviderName?: string | null,
  walletContext?: PreflightWalletContext
): PreparedTransaction {
  const token = SUPPORTED_TOKENS.find((t) => t.symbol === intention.tokenSymbol) || SUPPORTED_TOKENS[0];
  const safeAddress = recipient?.address || '';
  const effectiveWalletContext: PreflightWalletContext = walletContext || {
    walletState: connectedWalletAddress
      ? {
          isConnected: true,
          address: connectedWalletAddress,
          chainId: BASE_MAINNET_CHAIN_ID,
          providerName: walletProviderName,
        }
      : null,
    liveBalance: null,
  };
  const preflightReport = runPreflightChecks(
    recipient,
    intention,
    token,
    safeAddress,
    intention.amount,
    effectiveWalletContext
  );

  let rawCalldata = '0x';
  let value = '0';

  if (token.symbol === 'ETH') {
    value = parseUnits(intention.amount.toString(), 18).toString();
    rawCalldata = '0x'; // Native ETH transfer
  } else {
    try {
      if (safeAddress && isAddress(safeAddress)) {
        const rawUnits = parseUnits(intention.amount.toString(), token.decimals);
        rawCalldata = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [safeAddress as `0x${string}`, rawUnits],
        });
      } else {
        rawCalldata = '0x';
      }
    } catch {
      rawCalldata = '0xa9059cbb...[calldata encoding error]';
    }
  }

  return {
    id: `prep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    intentionId: intention.id,
    occurrenceId: getOccurrenceId(intention.id, intention.nextDueDate),
    recipientId: recipient?.id || intention.recipientId,
    recipientName: recipient?.name || 'Unknown Recipient',
    recipientAddress: safeAddress,
    amount: intention.amount,
    tokenSymbol: intention.tokenSymbol,
    networkId: intention.networkId,
    value,
    rawCalldata,
    estimatedGas: '0.000045 ETH (~$0.12 gas)',
    preflightReport,
    status: 'ready_for_review',
    executionMode: 'DEVELOPMENT_TESTNET_SIMULATION',
    signerAddress: connectedWalletAddress ? (getAddress(connectedWalletAddress) as string) : undefined,
    walletProvider: walletProviderName || undefined,
  };
}

export function verifyTransactionIntegrity(
  preparedTx: PreparedTransaction,
  intention: PaymentIntention,
  recipient: Recipient | undefined | null,
  currentConnectedAddress?: string | null,
  currentReport?: PreflightReport
): { valid: boolean; reason?: string } {
  if (!intention || !intention.id) {
    return { valid: false, reason: 'Authoritative intention record is missing.' };
  }
  if (
    intention.isRejected ||
    (intention.frequency === 'once' && (intention.isRejected || !!intention.rejectedAt))
  ) {
    return {
      valid: false,
      reason: 'This one-time payment intention has been rejected and is terminal. Further execution is strictly blocked.',
    };
  }
  if (
    intention.isCompleted ||
    (intention.frequency === 'once' && (intention.isCompleted || !!intention.completedAt))
  ) {
    return {
      valid: false,
      reason: 'This one-time payment intention has already completed and is terminal. Further execution is strictly blocked.',
    };
  }
  if (!intention.active) {
    return { valid: false, reason: 'Payment intention is paused or inactive.' };
  }
  if (!recipient) {
    return { valid: false, reason: 'Target recipient profile not found in Recipient Book.' };
  }
  if (preparedTx.intentionId !== intention.id) {
    return { valid: false, reason: `Transaction intention ID mismatch: ${preparedTx.intentionId} vs ${intention.id}.` };
  }
  const expectedOccId = getOccurrenceId(intention.id, intention.nextDueDate);
  if (preparedTx.occurrenceId && preparedTx.occurrenceId !== expectedOccId) {
    return {
      valid: false,
      reason: `Occurrence ID mismatch: prepared ${preparedTx.occurrenceId} does not match authoritative occurrence ${expectedOccId}.`,
    };
  }
  if (preparedTx.recipientId !== recipient.id) {
    return { valid: false, reason: `Prepared recipient ID mismatch: ${preparedTx.recipientId} vs ${recipient.id}.` };
  }
  if (preparedTx.recipientAddress.toLowerCase() !== recipient.address.toLowerCase()) {
    return { valid: false, reason: 'Prepared recipient address does not match verified address in Recipient Book.' };
  }
  if (preparedTx.amount !== intention.amount) {
    return { valid: false, reason: `Transaction amount altered: prepared ${preparedTx.amount} vs scheduled intention ${intention.amount}.` };
  }
  if (preparedTx.tokenSymbol !== intention.tokenSymbol) {
    return { valid: false, reason: `Asset token mismatch: ${preparedTx.tokenSymbol} vs ${intention.tokenSymbol}.` };
  }
  if (preparedTx.networkId !== intention.networkId) {
    return { valid: false, reason: `Network environment mismatch: ${preparedTx.networkId} vs ${intention.networkId}.` };
  }
  const activeReport = currentReport || preparedTx.preflightReport;
  if (!activeReport || !activeReport.canProceed) {
    return { valid: false, reason: 'Deterministic safety checks are in BLOCKED state.' };
  }

  // Account continuity check: verify the signing account matches the prepared signer if both exist
  if (
    preparedTx.signerAddress &&
    currentConnectedAddress &&
    preparedTx.signerAddress.toLowerCase() !== currentConnectedAddress.toLowerCase()
  ) {
    return {
      valid: false,
      reason: `Connected wallet address changed (${currentConnectedAddress}) from originally prepared signer (${preparedTx.signerAddress}). Please review and re-prepare with current account.`,
    };
  }

  return { valid: true };
}

// Generate clear simulated reference identifier (never masquerades as a verified on-chain tx hash)
export function generateSimulatedTxHash(): string {
  const randPart = Math.random().toString(16).substring(2, 8).toUpperCase();
  const timePart = Date.now().toString(16).substring(4).toUpperCase();
  return `SIM-BASE-MAIN-${randPart}${timePart}`;
}
