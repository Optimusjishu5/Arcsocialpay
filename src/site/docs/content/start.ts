import { APP_URL, EXPLORER_URL, GITHUB_URL } from '../../links'
import type { DocPage } from '../types'

export const START_PAGES: DocPage[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    group: 'Start here',
    summary: 'Connect a wallet, switch to Arc Mainnet and send your first USDC payment.',
    sections: [
      {
        id: 'what-you-need',
        title: 'What you need',
        blocks: [
          { t: 'ul', items: [
            'A browser wallet that injects an Ethereum provider, such as MetaMask. ConnectKit shows the wallets it finds.',
            'USDC on Arc Mainnet. On Arc, USDC is also the gas token, so one balance pays for both the amount and the fee.',
            'A small test amount. SocialPay runs on Arc Mainnet, where transactions use real funds and cannot be reversed.',
          ] },
          { t: 'callout', tone: 'warn', title: 'Mainnet only', text: 'SocialPay is configured for Arc Mainnet (chain ID 5042). Start with a small amount until you are comfortable with each flow.' },
        ],
      },
      {
        id: 'first-payment',
        title: 'Send your first payment',
        blocks: [
          { t: 'ol', items: [
            `Open the app at \`${APP_URL}\` and choose Connect Wallet.`,
            'Approve the connection in your wallet. If the wallet is on another network, SocialPay asks it to switch to Arc Mainnet.',
            'Open Pay, enter the recipient address, the amount in USDC and an optional note.',
            'Review the payment. The first payment asks for a USDC approval for the SocialPay contract, then the payment itself. Both are signed in your wallet.',
            'Wait for confirmation. The receipt links to Arc Explorer, and the payment appears in Activity.',
          ] },
          { t: 'diagram', id: 'payment-flow' },
        ],
      },
      {
        id: 'network-details',
        title: 'Add Arc Mainnet to a wallet by hand',
        blocks: [
          { t: 'p', text: 'SocialPay normally adds Arc for you. If you prefer to add it yourself, use these values.' },
          { t: 'facts' },
        ],
      },
      {
        id: 'next-steps',
        title: 'Where to go next',
        blocks: [
          { t: 'links', items: [
            { label: 'User Guide', href: '/docs/user-guide', note: 'A tour of every screen.' },
            { label: 'Send and Receive USDC', href: '/docs/send-receive-usdc', note: 'Approvals, memos and receipts in detail.' },
            { label: 'Security Documentation', href: '/docs/security', note: 'What protects you and what to watch for.' },
            { label: 'Source code', href: GITHUB_URL, note: 'Everything on this site describes this repository.' },
          ] },
        ],
      },
    ],
  },
  {
    slug: 'platform-overview',
    title: 'Platform Overview',
    group: 'Start here',
    summary: 'What SocialPay is, what it is made of, and which parts run on Arc and which do not.',
    sections: [
      {
        id: 'what-is-socialpay',
        title: 'What SocialPay is',
        blocks: [
          { t: 'p', text: 'SocialPay combines messaging, a social feed and USDC payments in one web app on Arc Mainnet. Our mission is to make sending money as easy and as personal as sending a message, while you keep control of your funds.' },
          { t: 'p', text: 'Money moves onchain. Conversations, posts and profiles are off-chain data, because storing them onchain would cost gas for every message and could not be edited or deleted.' },
        ],
      },
      {
        id: 'components',
        title: 'Main components',
        blocks: [
          { t: 'table', head: ['Component', 'What it does', 'Where it lives'], rows: [
            ['Web app', 'Pay, Messages, Explore, Swap, Bridge, Activity, Settings', '`src/App.tsx`, `src/components/`'],
            ['ArcSocialPay contract', 'Payments and tips with an onchain memo', '`contracts/ArcSocialPay.sol`'],
            ['API routes', 'Chat, social data, explorer history, receipt checks', '`app/api/`'],
            ['Database (optional)', 'Stores chat and social data when configured', '`lib/turso.ts`'],
            ['Wallet layer', 'Connect, sign and switch network', '`src/config.ts`, wagmi, viem, ConnectKit'],
          ] },
          { t: 'diagram', id: 'architecture' },
        ],
      },
      {
        id: 'onchain-vs-offchain',
        title: 'Onchain and off-chain data',
        blocks: [
          { t: 'table', head: ['Data', 'Where it is kept'], rows: [
            ['USDC balances and transfers', 'Arc Mainnet'],
            ['Payment memos and tip post ids', 'Arc Mainnet, as events from ArcSocialPay'],
            ['Chat messages, posts, comments, follows, profiles', 'SocialPay database when configured, otherwise your browser'],
            ['Settings, approval limit, scheduled reminders', 'Your browser'],
            ['Activity cache', 'Your browser (IndexedDB)'],
          ] },
          { t: 'callout', tone: 'info', title: 'Self-hosting note', text: 'Chat history persists on the server only when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set. Without them the app keeps data in the browser.' },
        ],
      },
      {
        id: 'usdc-on-arc',
        title: 'USDC on Arc',
        blocks: [
          { t: 'p', text: 'On Arc, USDC is the native gas token and also a normal ERC-20. It is one pool of money exposed two ways: the ERC-20 view uses 6 decimals and the native gas view uses 18 decimals. SocialPay shows a single USDC balance and uses exact integer math, so the two views are never added together.' },
        ],
      },
    ],
  },
  {
    slug: 'user-guide',
    title: 'User Guide',
    group: 'Start here',
    summary: 'A tour of every screen in the app and what each one is for.',
    sections: [
      {
        id: 'navigation',
        title: 'Navigation',
        blocks: [
          { t: 'table', head: ['Screen', 'Use it to'], rows: [
            ['Home', 'See your USDC balance, quick actions and recent activity. Signed-out visitors see an introduction.'],
            ['Messages', 'Chat one to one or in groups, and pay inside a conversation.'],
            ['Pay', 'Send, batch, request, split and schedule USDC payments.'],
            ['Swap', 'Trade tokens on Arc through several providers.'],
            ['Bridge', 'Move USDC to and from other chains.'],
            ['Explore', 'Read and post to the social feed, and tip authors.'],
            ['Activity', 'Search your full onchain history and export it as CSV.'],
            ['Alerts', 'See notifications about payments and social activity.'],
            ['Profile', 'Edit your name, bio and photo, or view someone else\'s profile.'],
            ['Settings', 'Choose your approval limit, review the contract, and change preferences.'],
          ] },
        ],
      },
      {
        id: 'wallet-and-network',
        title: 'Wallet and network',
        blocks: [
          { t: 'p', text: 'Connect from the top bar. If your wallet is on a different network, the app shows a prompt to switch to Arc Mainnet and keeps the details you typed.' },
          { t: 'p', text: 'Disconnecting clears private conversations from view. They are tied to the connected wallet and load again when you reconnect that wallet.' },
        ],
      },
      {
        id: 'theme',
        title: 'Light and dark theme',
        blocks: [
          { t: 'p', text: 'Use the theme button in the app sidebar or in the website header. The choice is stored in your browser and is shared between this website, the documentation and the app.' },
        ],
      },
      {
        id: 'activity',
        title: 'Activity and receipts',
        blocks: [
          { t: 'p', text: 'Activity combines payments made in SocialPay with your wider history read from Arc, one entry per transaction hash. The app reads in the background and stores results in your browser so later visits are fast. You can search, filter, group by day and export CSV.' },
          { t: 'p', text: `Each confirmed transaction links to Arc Explorer at ${EXPLORER_URL}. Before a transaction counts as confirmed, SocialPay checks its receipt on the Arc node.` },
        ],
      },
      {
        id: 'payment-links',
        title: 'Opening a payment link',
        blocks: [
          { t: 'p', text: 'A link such as `/?pay=0x...&amount=5&memo=Lunch` opens the app straight on the Pay screen with the recipient, amount and note filled in. Nothing is sent until you review and sign.' },
          { t: 'callout', tone: 'info', text: 'Payment links are not changed by the landing page. They keep opening the app.' },
        ],
      },
    ],
  },
]
