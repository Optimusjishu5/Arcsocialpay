// Single source of truth for every link and address the marketing site and docs show.
// Every address below already appears in this repository (src/contracts/arcSocialPay.ts, src/lib/*,
// src/onchain-facts.ts, AGENTS.md). Nothing here is invented: add a row only for something real.

export const SITE_NAME = 'SocialPay'
export const SITE_URL = 'https://socialpay.online'
export const GITHUB_URL = 'https://github.com/Optimusjishu5/Arcsocialpay'
export const X_URL = 'https://x.com/SocialPayHQ'
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`
export const GITHUB_CONTRACT_URL = `${GITHUB_URL}/blob/main/contracts/ArcSocialPay.sol`
export const APP_URL = '/app'
export const DOCS_URL = '/docs'

export const EXPLORER_URL = 'https://explorer.arc.io'
export const ARC_RPC_URL = 'https://rpc.mainnet.arc.io'
export const ARC_CHAIN_ID = 5042
export const ARC_DOCS_URL = 'https://docs.arc.io'
export const CIRCLE_DOCS_URL = 'https://developers.circle.com'

export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`

export interface AddressFact {
  name: string
  address: string
  /** What it is, in plain words. */
  note: string
  /** Where in this repository it is used. */
  where: string
}

/** Contracts SocialPay deploys itself. */
export const OWN_CONTRACTS: AddressFact[] = [
  {
    name: 'ArcSocialPay',
    address: '0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54',
    note: 'Payments and tips with an onchain memo. Holds no funds, no fees, not upgradeable.',
    where: 'contracts/ArcSocialPay.sol, src/contracts/arcSocialPay.ts',
  },
  {
    name: 'Create2Factory',
    address: '0x375Fb60CA0ba2f3bfBfE95eb122ecF087bD1334d',
    note: 'Deployment infrastructure for deterministic addresses. The app does not call it.',
    where: 'contracts/script/Create2Factory.sol',
  },
]

/** Third-party contracts the app talks to on Arc Mainnet. */
export const PROTOCOL_CONTRACTS: AddressFact[] = [
  {
    name: 'USDC (ERC-20 view, 6 decimals)',
    address: '0x3600000000000000000000000000000000000000',
    note: 'Circle USDC on Arc. Also the gas token (18-decimal native view).',
    where: 'src/hooks/useArcWallet.ts, src/lib/arcTokens.ts',
  },
  {
    name: 'EURC',
    address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
    note: 'Circle euro stablecoin on Arc.',
    where: 'src/lib/arcTokens.ts',
  },
  {
    name: 'cirBTC',
    address: '0x171A4217b86A807A64eB94757db6849fb4bDbAA0',
    note: 'Circle wrapped Bitcoin on Arc (8 decimals).',
    where: 'src/lib/arcTokens.ts',
  },
  {
    name: 'CCTP TokenMessengerV2',
    address: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
    note: 'Circle CCTP contract that burns USDC when bridging out of Arc. Used to recognise bridges in Activity.',
    where: 'src/lib/bridgeDetect.ts',
  },
  {
    name: 'Uniswap v3 Factory',
    address: '0xf0db7b58379503491d857dB50AC9ece64c653918',
    note: 'Uniswap v3 deployment on Arc.',
    where: 'src/lib/uniswapArc.ts',
  },
  {
    name: 'Uniswap v3 QuoterV2',
    address: '0x7dfd4f31be6814d2906bde155c3e1b146eac1468',
    note: 'Read-only price quotes for Best price swaps.',
    where: 'src/lib/uniswapArc.ts',
  },
  {
    name: 'Uniswap SwapRouter02',
    address: '0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77',
    note: 'Router that executes Uniswap swaps.',
    where: 'src/lib/uniswapArc.ts',
  },
  {
    name: 'Multicall3',
    address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    note: 'Reads many token balances in one request.',
    where: 'src/lib/arcTokens.ts',
  },
]

export const ARC_FACTS = [
  { label: 'Network', value: 'Arc Mainnet' },
  { label: 'Chain ID', value: String(ARC_CHAIN_ID) },
  { label: 'RPC', value: ARC_RPC_URL },
  { label: 'Explorer', value: EXPLORER_URL },
  { label: 'Gas token', value: 'USDC (18-decimal native view)' },
  { label: 'USDC (ERC-20)', value: '0x3600000000000000000000000000000000000000, 6 decimals' },
  { label: 'CCTP domain', value: '26' },
] as const

export const FOOTER_LINKS = [
  { label: 'Website', href: '/', external: false },
  { label: 'Documentation', href: DOCS_URL, external: false },
  { label: 'GitHub', href: GITHUB_URL, external: true },
  { label: 'X', href: X_URL, external: true },
  { label: 'Contact', href: GITHUB_ISSUES_URL, external: true },
  { label: 'Arc Explorer', href: EXPLORER_URL, external: true },
] as const
