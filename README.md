# SocialPay (Next.js + Turso + Arc Mainnet)

> Built with Arc Studio - money-powered apps in minutes

Social messaging with native USDC payments on **Arc Mainnet**.

## What This App Does

- Chat + pay: direct messages with in-chat USDC sends
- Social feed: posts, likes, comments, reposts, follows
- Payments: send/receive USDC with exact bigint money math (6-dec ERC-20 view, 18-dec gas view)
- Profiles, notifications, groups/channels
- Chat history persists in **Turso (LibSQL)** when `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set; otherwise falls back to localStorage

## Tech Stack

- Frontend: Next.js 15 (App Router), React 18, TypeScript 5, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- DB: Turso (LibSQL) via `@libsql/client` — `lib/turso.ts`, APIs in `app/api/conversations` + `app/api/messages`
- Contracts: Solidity 0.8.28 + Hardhat (Foundry files kept for compat). Sources in `contracts/`, tests in `test/*.ts`. Compile with `npm run hardhat:compile`, test with `npm run hardhat:test`.
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Mainnet (Chain ID: 5042, `src/chains.ts`)
- Token: USDC — ERC-20 6 decimals + native gas 18 decimals (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Mainnet)
- Toasts: Sonner

## Key Files

- `app/page.tsx` - Next.js entry (renders `src/App.tsx` under `app/providers.tsx`)
- `app/layout.tsx` - HTML shell + fonts + metadata
- `app/providers.tsx` - wagmi + react-query + ConnectKit + Toaster (client)
- `app/api/conversations/route.ts` - Turso-backed conversations API
- `app/api/messages/route.ts` - Turso-backed messages API
- `app/api/health/route.ts` - chain + Turso status probe
- `lib/turso.ts` - LibSQL client + chat schema
- `src/hooks/usePersistentChat.ts` - hydrate + write-through sync (Turso ↔ appStore)
- `src/App.tsx` - Main application logic (client component)
- `src/components/` - UI components
- `src/chains.ts` - Arc Mainnet definition (single source of truth)
- `src/config.ts` - wagmi config (Arc Mainnet only)
- `src/store/appStore.ts` - app state + `importConversations`/`importMessages` for Turso hydration

## To Run

```bash
npm install
cp .env.example .env
# fill TURSO_DATABASE_URL + TURSO_AUTH_TOKEN for persistent chat
# fill DEPLOYER_PRIVATE_KEY only when deploying contracts (never commit)
npm run dev
```

## Chain

- Network: Arc Mainnet
- Chain ID: 5042
- RPC: https://rpc.mainnet.arc.io (override: `NEXT_PUBLIC_ARC_RPC`)
- Explorer: https://explorer.arc.io
- Native gas token: USDC

## Live contracts

- ArcSocialPay `0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54` — on-chain tips + memo payments (`contracts/ArcSocialPay.sol`, deployed via Remix). Set `NEXT_PUBLIC_SOCIAL_PAY_ADDRESS` to activate the contract route in Pay + in-chat pay; unset = direct USDC transfers.

## Contracts (Hardhat, Arc Mainnet-ready, no auto-deploy)

```bash
npm run hardhat:compile
npm run hardhat:test
# when ready to deploy (NOT done automatically):
npm run deploy:create2factory   # --network arc (Chain ID 5042)
```

Solidity 0.8.28, optimizer 200 runs, evmVersion paris (matches foundry.toml so CREATE2 predictions agree).
Node >= 18.18 required (Next.js 15 + Hardhat 2.22 + ethers 6 compatible).
No contracts are deployed by migration scripts.
