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

---

## Preview server (sandbox)

The sandbox preview runs the optimized build (`bunx next start -H 0.0.0.0 -p 5173`), not `next dev`: the dev server's bundle is ~17 MB and it ran the sandbox out of memory. After any code change, run `bunx next build` (about a minute) and restart the preview server so the change shows up. Stop the preview server before building.

## Recent changes

- Activity tab: reads the wallet's full history from Arc in the background (paused/resumed from the Activity screen) and stores it permanently in the browser's IndexedDB together with scan progress (`src/lib/activityCache.ts`; bump `SCAN_VERSION` there to force a rescan). Search/filters/day groups/CSV export.
  - Arc logs ALL USDC movement (native sends, ERC-20 transfers, mints, burns) from the system emitter `0xffff...fffE` in 18 decimals; a plain native send emits no log from the ERC-20 contract. The scan reads USDC only from the system emitter (converted to 6 decimals) plus other tokens from their own contracts (`src/lib/onchainActivity.ts`).
  - RPCs: `rpc.mainnet.arc.io` accepts 8,000-block windows and about a 60-request burst then one request per ~2 s. `rpc.blockdaemon.mainnet.arc.io` accepts 100,000-block windows with no observed limit but keeps only ~2.5 days, so it serves the newest days; older blocks use the primary RPC. Each RPC has its own adaptive pace.
- Pay > Batch: two-step flow (add recipients, then review and confirm). Components: `src/components/pay/BatchForm.tsx`, `BatchRowItem.tsx`, `BatchReview.tsx`.
- Social sync (`src/hooks/usePersistentSocial.ts`, `src/utils/socialSync.ts`): a post counts as saved only after the server confirms it; fixes fresh posts being dropped by a poll that started before the save.
- Known issue: `bun run hardhat:test` fails because Hardhat tries to compile `contracts/test/*.t.sol` (needs forge-std). Foundry tests (`forge test`) are the working suite.
