# SocialPay

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Social messaging with native USDC payments on Arc Mainnet: chat + in-chat pay, social feed, send/receive USDC, profiles, notifications, groups. Chat history persists in Turso (LibSQL) when configured, otherwise localStorage.

## Tech Stack

- Frontend: Next.js 15 (App Router), React 18, TypeScript 5, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- DB: Turso (LibSQL) — `lib/turso.ts`, `app/api/conversations`, `app/api/messages`, `src/hooks/usePersistentChat.ts`
- Contracts: Solidity 0.8.28 + Hardhat (ready for Arc Mainnet, Chain ID 5042). Sources in `contracts/`, tests in `test/*.ts`. Compile with `npm run hardhat:compile`, test with `npm run hardhat:test`.
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Mainnet (Chain ID: 5042, defined in `src/chains.ts`)
- Token: USDC (ERC-20 6 decimals + gas 18 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Mainnet)
- Toasts: Sonner

## Live Deployments (Arc Mainnet, Chain ID 5042)

- ArcSocialPay: 0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54 ([explorer](https://explorer.arc.io/address/0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54)) — source `contracts/ArcSocialPay.sol`, deployed via Remix. Frontend binds via `src/contracts/arcSocialPay.ts` + `src/hooks/useSocialPay.ts`, address from `NEXT_PUBLIC_SOCIAL_PAY_ADDRESS`. Empty = direct-USDC fallback.
- Create2Factory: 0x375Fb60CA0ba2f3bfBfE95eb122ecF087bD1334d — infra for deterministic deploys, not used by the UI.

## Key Files

- `app/page.tsx` - Next.js entry (renders `src/App.tsx`)
- `app/providers.tsx` - wagmi/react-query/ConnectKit providers
- `lib/turso.ts` - Turso client + chat schema (conversations, messages)
- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/chains.ts` - Arc Mainnet definition (single source of truth)
- `src/config.ts` - wagmi config (Arc Mainnet only)

## To Run

```bash
npm install
npm run dev
```
