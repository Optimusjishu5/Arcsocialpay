import { CIRCLE_DOCS_URL } from '../../links'
import type { DocPage } from '../types'

export const INTEGRATION_PAGES: DocPage[] = [
  {
    slug: 'swap-integration',
    title: 'Swap Integration',
    group: 'Integrations',
    summary: 'How swaps work on Arc: three modes, four providers, and the checks made before you sign.',
    sections: [
      {
        id: 'modes',
        title: 'Three swap modes',
        blocks: [
          { t: 'table', head: ['Mode', 'Providers', 'Good for'], rows: [
            ['Best price', 'Uniswap v3 (direct pool quotes) and KyberSwap aggregator', 'Comparing two sources for the same pair and taking the better output.'],
            ['Any token', 'LI.FI routing', 'Routing a wider set of tokens through the LI.FI aggregator.'],
            ['Circle swap', 'Circle App Kit', 'Swapping between USDC, EURC and cirBTC on Arc.'],
          ] },
          { t: 'callout', tone: 'info', text: 'Third-party providers are separate services with their own terms. SocialPay shows their quotes. It does not control their liquidity or pricing.' },
        ],
      },
      {
        id: 'how-it-works',
        title: 'How a swap runs',
        blocks: [
          { t: 'ol', items: [
            'Pick the token you pay and the token you receive, and enter an amount.',
            'Choose a maximum slippage. Higher values let the price move further against you before the swap settles.',
            'Review the quote: expected output, guaranteed minimum output, provider details and the contract that needs your approval.',
            'Approve the exact spender if needed, then sign the swap.',
            'The result is recorded in Activity with a link to Arc Explorer.',
          ] },
          { t: 'p', text: 'Uniswap quotes come straight from the Uniswap v3 QuoterV2 contract on Arc across the 0.01%, 0.05%, 0.3% and 1% fee tiers. The swap goes through SwapRouter02 and expires 20 minutes after you confirm.' },
        ],
      },
      {
        id: 'safety-checks',
        title: 'Checks before you sign',
        blocks: [
          { t: 'p', text: 'Every transaction a provider returns is checked in your browser before the wallet is asked to sign. The swap is cancelled if:' },
          { t: 'ul', items: [
            'The route attaches native value to the swap.',
            'A Uniswap swap does not point at the known Uniswap router on Arc, or a KyberSwap swap does not point at its known router.',
            'A LI.FI approval target does not match the swap contract.',
            'The route returns no output, or a minimum output of zero.',
          ] },
          { t: 'p', text: 'Arc uses USDC for gas, so the app keeps a 0.05 USDC reserve when you swap your whole USDC balance. USDC and the native gas token are the same asset on Arc, so a USDC to native swap is never offered.' },
        ],
      },
      {
        id: 'limits',
        title: 'Known limits',
        blocks: [
          { t: 'ul', items: [
            'LI.FI is used without an API key. Its free rate limit is small, so that mode asks you to press a button to fetch a price instead of updating while you type.',
            'Token lists combine what LI.FI and KyberSwap publish for Arc plus USDC, EURC and cirBTC, and are cached for 30 minutes.',
            'A pair with no liquidity returns a clear "no route" message instead of a bad quote.',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'bridge-integration',
    title: 'Bridge Integration',
    group: 'Integrations',
    summary: 'Move USDC to and from Arc with Circle CCTP, or compare cross-chain routes.',
    sections: [
      {
        id: 'tabs',
        title: 'Three ways to bridge',
        blocks: [
          { t: 'table', head: ['Tab', 'Powered by', 'Notes'], rows: [
            ['LI.FI', 'LI.FI', 'Bridges between any two EVM networks LI.FI supports, using the chain list it publishes.'],
            ['Circle CCTP', 'Circle App Kit', 'Native USDC: burn on the source chain, mint on the destination. One to one.'],
            ['Compare', 'Across, Relay and LI.FI', 'Shows each provider\'s estimated output and time so you can pick.'],
          ] },
        ],
      },
      {
        id: 'cctp',
        title: 'Circle CCTP bridge',
        blocks: [
          { t: 'p', text: 'The Circle CCTP tab uses Circle App Kit. The kit lists the mainnet EVM chains that support CCTP and USDC, so the chain choices come from the SDK rather than a hand-kept list.' },
          { t: 'diagram', id: 'bridge-flow' },
          { t: 'ol', items: [
            'Pick the source and destination chain, an amount, and optionally a different recipient address.',
            'Review the estimate. Gas on each chain and Circle fees are shown before you confirm.',
            'The kit runs four steps and the screen ticks each one off: approve, burn, wait for Circle attestation, mint.',
            'If a step is interrupted, Retry continues the same transfer instead of starting over.',
          ] },
          { t: 'p', text: 'Delivery uses Circle\'s forwarding option, so Circle\'s transfer service completes the mint on the destination chain and its fee is shown before you confirm.' },
          { t: 'callout', tone: 'warn', text: 'Mainnet bridging moves real funds and cannot be undone. Start with a small amount. The app warns above 100 USDC.' },
        ],
      },
      {
        id: 'compare',
        title: 'Comparing routes',
        blocks: [
          { t: 'ul', items: [
            'Quotes from Across, Relay and LI.FI come from their public APIs, which work from the browser without a key.',
            'Quotes expire after one minute and must be refreshed.',
            'Every transaction a provider returns is checked before signing. Approvals larger than the amount you are bridging are rebuilt for exactly that amount.',
            'After the source transaction, delivery is tracked with the provider\'s own status endpoint.',
          ] },
        ],
      },
      {
        id: 'activity',
        title: 'Bridges in Activity',
        blocks: [
          { t: 'p', text: 'A transfer out of Arc that burns USDC through CCTP TokenMessengerV2 is recognised from its receipt and labelled a Bridge. Bridges through Across, Relay and LI.FI share no common event, so they appear only where the app recorded them. Tokens that arrive from a bridge show as received transfers.' },
        ],
      },
    ],
  },
  {
    slug: 'circle-integrations',
    title: 'Circle Products and Integrations',
    group: 'Integrations',
    summary: 'Exactly which Circle products SocialPay uses, what for, and where they live in the code.',
    sections: [
      {
        id: 'summary',
        title: 'What SocialPay uses from Circle',
        blocks: [
          { t: 'p', text: 'This page lists only integrations that exist in the repository today. Mentioning a product here means the code calls it. It does not imply a partnership or endorsement.' },
          { t: 'table', head: ['Circle product', 'What SocialPay uses it for', 'Where in the code'], rows: [
            ['USDC', 'The unit for payments, tips, approvals and bridges. Also the gas token on Arc.', '`src/hooks/useArcWallet.ts`, `src/contracts/arcSocialPay.ts`, `contracts/ArcSocialPay.sol`'],
            ['EURC and cirBTC', 'Selectable tokens in swaps and token lists on Arc.', '`src/lib/arcTokens.ts`, `src/lib/uniswapArc.ts`, `src/components/swap/CircleSwap.tsx`'],
            ['Circle App Kit (`@circle-fin/app-kit`): bridge', 'Native USDC bridging over CCTP: estimate, bridge, retry and step events.', '`src/components/bridge/CctpBridge.tsx`, `src/lib/circleKit.ts`'],
            ['Circle App Kit: swap', 'Estimating and executing stablecoin swaps among USDC, EURC and cirBTC.', '`src/components/swap/CircleSwap.tsx`'],
            ['Viem adapter (`@circle-fin/adapter-viem-v2`)', 'Lets App Kit sign with the wallet connected through wagmi.', '`src/lib/circleKit.ts`'],
            ['CCTP TokenMessengerV2 contract', 'Recognises bridges out of Arc in Activity by reading the burn event.', '`src/lib/bridgeDetect.ts`'],
          ] },
        ],
      },
      {
        id: 'usdc',
        title: 'USDC',
        blocks: [
          { t: 'p', text: 'USDC on Arc is at `0x3600000000000000000000000000000000000000`. As an ERC-20 it has 6 decimals. As the native gas token it is shown with 18 decimals. SocialPay reads one USDC balance, never adds the two views together, and does all money math with exact integers.' },
          { t: 'p', text: 'The ArcSocialPay contract takes the USDC address in its constructor and only ever calls the 6-decimal ERC-20 interface.' },
        ],
      },
      {
        id: 'routing',
        title: 'Circle routing in swaps',
        blocks: [
          { t: 'p', text: 'The Circle swap tab asks App Kit for an estimate and then asks it to execute. On Arc it offers USDC, EURC and cirBTC only. App Kit chooses the route, which can come from a third-party swap service provider, as the in-app notice says. SocialPay does not choose or re-check that route beyond the slippage you set.' },
          { t: 'p', text: 'The Best price and Any token tabs do not use Circle routing. They use Uniswap, KyberSwap and LI.FI.' },
        ],
      },
      {
        id: 'cctp',
        title: 'Native CCTP',
        blocks: [
          { t: 'p', text: 'The Circle CCTP tab calls App Kit\'s bridge. App Kit performs the approve, burn, attestation and mint steps over Circle\'s Cross-Chain Transfer Protocol, and SocialPay shows each step. The destination mint is delivered with Circle\'s forwarding option.' },
          { t: 'p', text: 'The bridge calls App Kit; SocialPay does not call TokenMessenger directly to bridge. It reads the TokenMessengerV2 `DepositForBurn` event only to label a past transaction as a bridge in Activity.' },
          { t: 'code', lang: 'ts', text: "kit.estimateBridge({ from, to: { ...to, useForwarder: true }, amount })\nkit.bridge({ from, to, amount })\nkit.retryBridge(result, { from, to })" },
        ],
      },
      {
        id: 'not-used',
        title: 'Not integrated',
        blocks: [
          { t: 'p', text: 'To avoid confusion, SocialPay does not currently use these Circle products:' },
          { t: 'ul', items: [
            'Circle Wallets (developer-controlled, user-controlled or modular). Users bring their own wallet.',
            'Circle Gateway or Nanopayments. No Gateway contract or x402 flow is called, although some x402 packages appear in `package.json`.',
            'Circle Mint, onramp or payouts.',
            'Circle Paymaster or Gas Station. Gas is paid in USDC by the user.',
          ] },
        ],
      },
      {
        id: 'references',
        title: 'Official references',
        blocks: [
          { t: 'links', items: [
            { label: 'Circle developer documentation', href: CIRCLE_DOCS_URL, note: 'Current App Kit, CCTP and USDC documentation.' },
            { label: 'Arc documentation', href: 'https://docs.arc.io', note: 'Network details and USDC on Arc.' },
          ] },
        ],
      },
    ],
  },
]
