# Arc → Sepolia Fee Bridge — Step-by-step

Complete walkthrough to bridge USDC fees from Arc Testnet to the YSM Router on Sepolia, then flush them into the Vault so YST holders can claim.

---

## Overview

```
Arc Testnet wallet
  └─ USDC (native, 18 dec)
       │  Circle CCTP V2 (bridge-arc-to-sepolia.ts)
       ▼
  YSM Router (Sepolia)
       │  flushBalance()  ← UI button "Flush Arc fees"
       ▼
  ┌────────────┬────────────────┐
  │  Vault     │   Treasury     │
  │ (streamBps)│ (rest)         │
  └────────────┴────────────────┘
       │  claimRewards()
       ▼
  YST holder wallet
```

---

## Prerequisites

| What | Where to get it |
|------|----------------|
| Arc Testnet USDC | [Arc faucet](https://faucet.arc.fun) — USDC is the **native token** (18 decimals, not ERC20) |
| Arc wallet private key | The wallet that holds Arc USDC |
| Node.js ≥ 18 | — |
| `smart-contracts/.env` configured | See below |

---

## Step 1 — Configure `.env`

In `smart-contracts/.env`, add:

```env
PRIVATE_KEY=0xYOUR_ARC_WALLET_PRIVATE_KEY
BRIDGE_AMOUNT_USDC=5.00
```

> `BRIDGE_AMOUNT_USDC` is the amount you want to bridge, in human USDC (e.g. `"5.00"`).
> The script converts to 18-decimal internally.

---

## Step 2 — Install Bridge Kit dependencies

```bash
cd smart-contracts
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2
```

---

## Step 3 — Run the bridge script

```bash
cd smart-contracts
npx ts-node scripts/bridge-arc-to-sepolia.ts
```

Expected output:
```
🌉 Bridge Arc Testnet → Ethereum Sepolia
   Amount    : 5.00 USDC
   Recipient : 0x02E75407... (YSM Router)

✅ Bridge initié !
   Result: { ... }

⏳ Attends ~1-3 min que Circle finalise le mint sur Sepolia.
   Ensuite, appelle flushBalance() sur le Router Sepolia depuis l'UI.
```

> **Note:** Circle's forwarder takes a small fee (~7–8%). If you bridge 5 USDC, ~4.6 USDC arrives on Sepolia. This is expected.

---

## Step 4 — Verify USDC arrived on Sepolia

Go to Etherscan Sepolia and check the Router address balance:

```
https://sepolia.etherscan.io/address/0x02E75407376e5FBEd0e507E8265d92CeE9279fDC
```

Under **ERC-20 Token Txns**, you should see an incoming USDC transfer from Circle's CCTP minter.

---

## Step 5 — Flush fees via the UI

1. Open the YSM app and navigate to the stream page (`/invest/[id]`)
2. Connect your wallet — **must be on Sepolia**
3. Scroll down past the `ARC CONSOLIDATION HUB`
4. Click the gold **"Flush Arc fees"** button
5. Confirm the transaction in MetaMask

What happens on-chain:
- `Router.flushBalance()` reads the current USDC balance
- Sends `vaultBps%` → `Vault.depositFees()` (updates reward-per-token for YST holders)
- Sends the rest → Treasury
- Emits `FeesReceived` event → the Arc Activity Feed updates in the UI

---

## Step 6 — Claim rewards (investor)

As a YST holder:
1. On the same stream page, click **"Claim yield"**
2. Confirm in MetaMask
3. USDC lands in your wallet

---

## Addresses (current deployment)

| Contract | Network | Address |
|----------|---------|---------|
| Router (YSM stream) | Sepolia | `0x02E75407376e5FBEd0e507E8265d92CeE9279fDC` |
| Factory | Sepolia | `0x0d5871393aeAA37aF403A9f6C24cCe44B12297e6` |
| USDC | Sepolia | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| TokenMessengerV2 | Arc Testnet | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| USDC (native) | Arc Testnet | `0x3600000000000000000000000000000000000000` |

> **If a new stream was created via the Factory**, the Router address changes.
> After creating a stream, get the new Router with:
> ```
> Factory.getAllStreamKeys()   → take the last key
> Factory.getStream(key)       → read the `splitter` field = new Router
> ```
> Then update `ARC_STREAM_ROUTER` in `frontend/src/contracts/index.ts`.

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Bridge script fails with `PRIVATE_KEY` error | Missing or wrong format | Must start with `0x` |
| USDC doesn't arrive after 5+ min | CCTP attestation pending | Check [Circle CCTP explorer](https://iris-api-sandbox.circle.com) |
| "Flush Arc fees" button not visible | Wallet not on Sepolia, or not connected | Switch to Sepolia in MetaMask |
| `flushBalance()` reverts with `ZeroAmount` | No USDC in Router yet | Bridge hasn't arrived yet — wait |
| Less USDC than expected arrives | Circle forwarder fee | Expected — ~7% taken by Circle |
