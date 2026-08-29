import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  TimeoutError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  formatEther,
} from "viem";

/// A rejection, translated from contract error to something a person reads.
/// `errorName` is kept so the UI can show exactly which on-chain rule fired.
export type Rejection = {
  kind: "policy" | "funds" | "permission" | "state" | "user-rejected" | "rpc" | "unknown";
  headline: string;
  reason: string;
  detail?: string;
  machineId?: string;
  requested?: bigint;
  allowed?: bigint;
  errorName?: string;
  /// True only when the contract itself decided: a decoded revert came back.
  /// An RPC or wallet failure means we never got a verdict, which must not be
  /// presented — or recorded in the timeline — as the contract refusing.
  fromContract?: boolean;
  raw: string;
};

function revertedError(error: unknown): ContractFunctionRevertedError | null {
  if (!(error instanceof BaseError)) return null;
  const found = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return found instanceof ContractFunctionRevertedError ? found : null;
}

function userRejected(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  if (error.walk((e) => e instanceof UserRejectedRequestError)) return true;
  const code = (error as { code?: number }).code;
  return code === 4001 || /user (rejected|denied)/i.test(error.message);
}

/// viem nests the interesting error inside a chain of wrappers, so identifying
/// one means walking that chain rather than checking `instanceof` on the top.
function walked(error: unknown, type: abstract new (...args: never[]) => Error): boolean {
  if (!(error instanceof BaseError)) return error instanceof type;
  return Boolean(error.walk((e) => e instanceof type));
}

const rawMessage = (error: unknown): string => {
  if (error instanceof BaseError) return error.shortMessage || error.message;
  if (error instanceof Error) return error.message;
  return String(error);
};

/// Everything this returns came out of a decoded contract revert, so it is the
/// contract's own verdict rather than a guess about why a call failed.
function fromRevert(reverted: ContractFunctionRevertedError, raw: string): Rejection {
  return { ...classifyRevert(reverted, raw), fromContract: true };
}

/// The headline case for the demo: an over-limit payment. The numbers come back
/// from the contract itself, not from anything the frontend decided.
function classifyRevert(reverted: ContractFunctionRevertedError, raw: string): Rejection {
  const name = reverted.data?.errorName ?? reverted.reason ?? "Reverted";
  const args = (reverted.data?.args ?? []) as unknown[];
  const str = (i: number) => (typeof args[i] === "string" ? (args[i] as string) : undefined);
  const num = (i: number) => (typeof args[i] === "bigint" ? (args[i] as bigint) : undefined);
  const fmt = (v: bigint | undefined) => (v === undefined ? "—" : formatEther(v));

  switch (name) {
    case "SpendingLimitExceeded":
      return {
        kind: "policy",
        headline: "Transaction blocked",
        reason: "Spending policy exceeded",
        detail: "The contract refused the payment. No funds moved.",
        machineId: str(0),
        requested: num(1),
        allowed: num(2),
        errorName: name,
        raw,
      };
    case "InsufficientBalance":
      return {
        kind: "funds",
        headline: "Transaction blocked",
        reason: "Machine balance too low",
        detail: "Top the machine up and try again.",
        machineId: str(0),
        requested: num(1),
        allowed: num(2),
        errorName: name,
        raw,
      };
    case "DailyLimitExceeded":
      return {
        kind: "policy",
        headline: "Transaction blocked",
        reason: "Daily spending budget exhausted",
        detail: `${str(0) ?? "That machine"} has ${fmt(num(2))} MON left of its ${fmt(num(3))} MON daily budget. The budget resets at 00:00 UTC.`,
        machineId: str(0),
        requested: num(1),
        // The panel's "maximum allowed" row shows what is left today, which is
        // the number that actually refused this payment.
        allowed: num(2),
        errorName: name,
        raw,
      };
    case "NotAuthorized":
      return {
        kind: "permission",
        headline: "Transaction blocked",
        reason: "This account cannot spend that machine's funds",
        detail: "Only the machine's operator or its on-device controller can initiate payments.",
        machineId: str(0),
        errorName: name,
        raw,
      };
    case "NotOwner":
      return {
        kind: "permission",
        headline: "Change rejected",
        reason: "Only the machine's operator can change its rules",
        machineId: str(0),
        errorName: name,
        raw,
      };
    case "MachineIsPaused":
      return {
        kind: "state",
        headline: "Transaction blocked",
        reason: `${str(0) ?? "That machine"} is paused`,
        detail: "A paused machine can neither send nor receive.",
        machineId: str(0),
        errorName: name,
        raw,
      };
    case "CounterpartyNotAllowed":
      return {
        kind: "policy",
        headline: "Transaction blocked",
        reason: "Counterparty not on the allowlist",
        detail: `${str(0) ?? "The payer"} is not permitted to pay ${str(1) ?? "that machine"}.`,
        machineId: str(0),
        errorName: name,
        raw,
      };
    case "MachineNotFound":
      return {
        kind: "state",
        headline: "Not registered",
        reason: `${str(0) || "That machine"} does not exist yet`,
        detail: "Initialise the demo fleet first.",
        machineId: str(0),
        errorName: name,
        raw,
      };
    case "MachineAlreadyExists":
      return {
        kind: "state",
        headline: "Already registered",
        reason: `${str(0) ?? "That machine"} is already on chain`,
        machineId: str(0),
        errorName: name,
        raw,
      };
    case "SelfPayment":
      return { kind: "policy", headline: "Transaction blocked", reason: "A machine cannot pay itself", errorName: name, raw };
    case "ZeroAmount":
      return { kind: "policy", headline: "Transaction blocked", reason: "Amount must be greater than zero", errorName: name, raw };
    default:
      return { kind: "unknown", headline: "Transaction failed", reason: name, raw };
  }
}

export function toRejection(error: unknown): Rejection {
  const raw = rawMessage(error);
  if (userRejected(error)) {
    return {
      kind: "user-rejected",
      headline: "Not signed",
      reason: "You dismissed the wallet prompt",
      detail: "Nothing was sent to the network.",
      raw,
    };
  }
  const reverted = revertedError(error);
  if (reverted) return fromRevert(reverted, raw);

  // Everything below is a wallet, funding or network problem rather than a
  // policy decision, and each needs a different action from the operator.
  if (walked(error, InsufficientFundsError) || /insufficient funds/i.test(raw)) {
    return {
      kind: "funds",
      headline: "Not sent",
      reason: "Your wallet cannot cover the gas",
      detail: "The machine's balance is separate from your own. Top your wallet up with testnet MON and retry.",
      raw,
    };
  }
  if (walked(error, ChainMismatchError) || /chain( id)? mismatch|does not match the target chain/i.test(raw)) {
    return {
      kind: "state",
      headline: "Wrong network",
      reason: "Your wallet is on a different network",
      detail: "Switch the wallet to the network this dashboard is reading, then retry.",
      raw,
    };
  }
  if (walked(error, WaitForTransactionReceiptTimeoutError) || /timed out|timeout/i.test(raw)) {
    return {
      kind: "state",
      headline: "Still unconfirmed",
      reason: "The network has not confirmed this yet",
      detail: "The transaction may still land. Check the explorer link before retrying, so you do not pay twice.",
      raw,
    };
  }
  // An overloaded or rate-limiting endpoint. Monad's public RPC answers an
  // oversized request or response with HTTP 413, and a wallet that has retried
  // a few of those reports "too many errors" — neither is a contract decision,
  // so neither may be shown as one.
  if (
    /\b413\b|content too large|payload too large|request entity too large/i.test(raw) ||
    /too many errors|rate limit|too many requests|\b429\b/i.test(raw) ||
    /requested resource not available|limit exceeded|response size|block range/i.test(raw)
  ) {
    return {
      kind: "rpc",
      headline: "RPC endpoint overloaded",
      reason: "Monad's public RPC turned the request away",
      detail:
        "Nothing was signed or sent. This is the endpoint, not the contract or your policy — retry, or set VITE_MONAD_RPC_URL to a private endpoint.",
      raw,
    };
  }
  if (walked(error, HttpRequestError) || walked(error, TimeoutError) || /fetch failed|network error|failed to fetch/i.test(raw)) {
    return {
      kind: "rpc",
      headline: "Network unreachable",
      reason: "Could not reach the Monad RPC endpoint",
      detail: "Nothing was signed or sent. Check your connection, or set VITE_MONAD_RPC_URL to another endpoint.",
      raw,
    };
  }
  return { kind: "unknown", headline: "Transaction failed", reason: raw, raw };
}
