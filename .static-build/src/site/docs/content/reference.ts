import { GITHUB_CONTRACT_URL, GITHUB_ISSUES_URL, GITHUB_URL, EXPLORER_URL, explorerAddress, OWN_CONTRACTS } from '../../links'
import type { DocPage } from '../types'

const CONTRACT = OWN_CONTRACTS[0].address

export const REFERENCE_PAGES: DocPage[] = [
  {
    slug: 'smart-contract',
    title: 'Smart Contract Architecture',
    group: 'Reference',
    summary: 'The ArcSocialPay contract: what it does, its functions and events, and the design choices behind it.',
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        blocks: [
          { t: 'p', text: 'ArcSocialPay is a single Solidity file (version 0.8.28, no imports) deployed on Arc Mainnet. It moves USDC from a payer to a recipient and records a memo or a post id as an event. Plain ERC-20 transfers cannot carry that information.' },
          { t: 'addresses', group: 'own' },
          { t: 'links', items: [
            { label: 'View ArcSocialPay on Arc Explorer', href: explorerAddress(CONTRACT) },
            { label: 'Read the source on GitHub', href: GITHUB_CONTRACT_URL },
          ] },
          { t: 'callout', tone: 'info', title: 'Verification status', text: 'A live read of the contract on Arc confirmed that `VERSION` is 1.0.0, `usdc()` is the Arc USDC address and `paused()` is false. Whether the source is published as verified on Arc Explorer was not confirmed when this page was written. Check the Contract tab on the explorer.' },
        ],
      },
      {
        id: 'design',
        title: 'Design choices',
        blocks: [
          { t: 'ul', items: [
            'No custody. Every call pulls USDC with `transferFrom` and sends it to the recipient in the same call. The contract is meant to hold zero USDC.',
            'No fees, no upgrade proxy, no delegatecall, no self-destruct.',
            'Only the caller can spend their own allowance, because the payer is always `msg.sender`.',
            'Reentrancy lock on every state-changing flow.',
            'A transfer helper that also works with tokens that return no boolean, and reverts on a false return.',
            'Social data (posts, chats, profiles) stays off-chain. Events are the only onchain record, for indexing.',
          ] },
          { t: 'diagram', id: 'payment-flow' },
        ],
      },
      {
        id: 'functions',
        title: 'Functions',
        blocks: [
          { t: 'table', head: ['Function', 'Who', 'What it does'], rows: [
            ['`pay(recipient, amount, memo)`', 'Anyone', 'Pulls `amount` USDC from the caller to `recipient` and emits `Payment`. Memo up to 280 bytes.'],
            ['`tip(recipient, amount, postId)`', 'Anyone', 'Same transfer, emits `Tip` with an off-chain post id of up to 128 bytes.'],
            ['`myAllowance(account)`', 'View', 'USDC allowance `account` gave this contract.'],
            ['`canPay(account, amount)`', 'View', 'True if not paused, amount is above zero, and balance and allowance cover it.'],
            ['`usdc()`, `owner()`, `pendingOwner()`, `paused()`, `VERSION`', 'View', 'Configuration and state.'],
            ['`pause()`, `unpause()`', 'Owner', 'Stops or resumes `pay` and `tip`. Funds are never held, so a pause cannot freeze user money.'],
            ['`proposeOwner`, `acceptOwnership`, `cancelOwnershipTransfer`', 'Owner / pending owner', 'Two-step ownership transfer so a mistyped address cannot lock the contract.'],
            ['`rescueERC20(token, to, amount)`, `rescueNative(to)`', 'Owner', 'Recover tokens or native gas that were sent to the contract by mistake.'],
          ] },
          { t: 'p', text: 'Direct native transfers to the contract revert with `DIRECT_TRANSFERS_DISABLED`.' },
        ],
      },
      {
        id: 'events',
        title: 'Events',
        blocks: [
          { t: 'code', lang: 'solidity', text: 'event Payment(address indexed sender, address indexed recipient, uint256 amount, string memo);\nevent Tip(address indexed sender, address indexed recipient, uint256 amount, string postId);\nevent OwnershipProposed(address indexed currentOwner, address indexed proposedOwner);\nevent OwnershipTransferred(address indexed previousOwner, address indexed newOwner);\nevent Paused(address indexed account);\nevent Unpaused(address indexed account);\nevent Rescued(address indexed token, address indexed to, uint256 amount);' },
          { t: 'p', text: '`amount` is in 6-decimal USDC base units. For example, 1 USDC is `1000000`.' },
        ],
      },
      {
        id: 'reverts',
        title: 'Revert reasons',
        blocks: [
          { t: 'table', head: ['Reason', 'Meaning'], rows: [
            ['`RECIPIENT_ZERO`, `RECIPIENT_SELF`, `RECIPIENT_SELF_CONTRACT`, `RECIPIENT_USDC_CONTRACT`', 'The recipient is the zero address, yourself, this contract or the USDC contract.'],
            ['`AMOUNT_ZERO`', 'Amount must be above zero.'],
            ['`MEMO_TOO_LONG`, `POST_ID_TOO_LONG`', 'Over 280 or 128 bytes.'],
            ['`PAUSED`', 'The owner paused new payments.'],
            ['`REENTRANT`', 'A nested call was blocked.'],
            ['`NOT_OWNER`, `NOT_PENDING_OWNER`', 'The caller lacks the role for that call.'],
          ] },
        ],
      },
      {
        id: 'tests',
        title: 'Tests',
        blocks: [
          { t: 'p', text: 'The Foundry suite has 74 tests: unit tests for payments, tips, reverts, pause, ownership, rescue and reentrancy, plus two invariants that run 256 randomised sequences each. The invariants check that the contract never holds USDC and that total USDC is conserved. All passed in the most recent run.' },
          { t: 'code', lang: 'bash', text: 'forge build\nforge test' },
          { t: 'callout', tone: 'info', text: 'Tests are not an audit. See Security Documentation for what has and has not been reviewed.' },
        ],
      },
    ],
  },
  {
    slug: 'security',
    title: 'Security Documentation',
    group: 'Reference',
    summary: 'What protects you, what the owner can and cannot do, and the limits of what has been reviewed.',
    sections: [
      {
        id: 'review-status',
        title: 'Review status',
        blocks: [
          { t: 'callout', tone: 'warn', title: 'No published independent audit', text: 'No third-party audit report exists for SocialPay or the ArcSocialPay contract, and SocialPay holds no security certification. What exists is the public source and an automated test suite. Treat it accordingly and start with small amounts.' },
        ],
      },
      {
        id: 'funds',
        title: 'How your funds are protected',
        blocks: [
          { t: 'ul', items: [
            'Non-custodial. You hold the keys in your own wallet and sign every transaction.',
            'The contract holds no USDC, so there is no pool to drain.',
            'A payment needs your approval and your signature. Nobody else can spend your allowance.',
            'You choose the approval limit and can set the allowance back to zero in Settings.',
            'USDC amounts use exact integer math. The two USDC decimal views on Arc are never mixed.',
          ] },
        ],
      },
      {
        id: 'owner',
        title: 'What the owner can do',
        blocks: [
          { t: 'table', head: ['Can', 'Cannot'], rows: [
            ['Pause and unpause new payments and tips.', 'Move your USDC or spend your allowance.'],
            ['Rescue tokens or native gas that were sent to the contract by mistake.', 'Change the USDC address, which is fixed at deployment.'],
            ['Propose a new owner, who must accept.', 'Upgrade the contract or add fees.'],
          ] },
          { t: 'p', text: 'The owner is a single account. Read `owner()` on Arc Explorer to see it. A single owner key is a trust assumption: a compromised key could pause payments, but not take user funds.' },
        ],
      },
      {
        id: 'app-protections',
        title: 'App-level protections',
        blocks: [
          { t: 'ul', items: [
            'Swap and bridge transactions returned by providers are checked against what you reviewed before the wallet is asked to sign. Unexpected contracts, native value or oversized approvals stop the flow.',
            'Receipts are verified on the Arc node. Client-claimed status, block and time are replaced with the node\'s values before they are stored.',
            'Private chat data needs a wallet-signed session whose address comes from the verified token.',
            'Profile and message writes are signed by the wallet when a database is configured.',
            'Payment links only prefill the form. Nothing is sent without your review and signature.',
          ] },
        ],
      },
      {
        id: 'limits',
        title: 'Known limits',
        blocks: [
          { t: 'ul', items: [
            'Chat is not end-to-end encrypted. The server that stores history can read it.',
            'Scheduled payments are browser-stored reminders. Clearing site data removes them.',
            'Request expiry is shown to the payer but not enforced onchain.',
            'Batch payments are separate transactions and stop at the first failure.',
            'Third-party swap and bridge providers are outside SocialPay\'s control.',
            'Mainnet transactions are irreversible.',
          ] },
        ],
      },
      {
        id: 'stay-safe',
        title: 'Staying safe',
        blocks: [
          { t: 'ul', items: [
            'Check the recipient address character by character. Payments cannot be undone.',
            'Never share your seed phrase. SocialPay never asks for it.',
            'Prefer the Exact approval limit, or a limit you are comfortable losing track of, and revoke when done.',
            'Open SocialPay only from the address you trust, and read each wallet prompt.',
          ] },
        ],
      },
      {
        id: 'reporting',
        title: 'Reporting a problem',
        blocks: [
          { t: 'p', text: 'Report bugs through GitHub. For a suspected vulnerability, do not post exploit details in a public issue. Open an issue that asks for a private channel without describing the flaw, or use a private security advisory if the repository has them enabled.' },
          { t: 'links', items: [{ label: 'SocialPay issues on GitHub', href: GITHUB_ISSUES_URL }] },
        ],
      },
    ],
  },
  {
    slug: 'faq',
    title: 'FAQ',
    group: 'Reference',
    summary: 'Short answers to common questions about fees, safety, networks and data.',
    sections: [
      {
        id: 'general',
        title: 'General',
        blocks: [
          { t: 'h3', text: 'Which network does SocialPay use?' },
          { t: 'p', text: 'Arc Mainnet, chain ID 5042. USDC is the gas token.' },
          { t: 'h3', text: 'Does SocialPay hold my money?' },
          { t: 'p', text: 'No. Funds stay in your wallet until you sign a payment. The contract forwards USDC in the same transaction and keeps none.' },
          { t: 'h3', text: 'What does it cost?' },
          { t: 'p', text: 'SocialPay charges no fee. You pay Arc gas in USDC. Swap and bridge providers can charge their own fees, shown before you confirm.' },
          { t: 'h3', text: 'Is there a testnet version?' },
          { t: 'p', text: 'The app is configured for Arc Mainnet only.' },
        ],
      },
      {
        id: 'payments',
        title: 'Payments',
        blocks: [
          { t: 'h3', text: 'Why do I approve USDC before paying?' },
          { t: 'p', text: 'The contract moves USDC with `transferFrom`, which needs an allowance. Pick Exact in Settings to approve only each payment\'s amount.' },
          { t: 'h3', text: 'Can I cancel a payment?' },
          { t: 'p', text: 'Not after it is confirmed. You can reject the signature in your wallet before it is sent.' },
          { t: 'h3', text: 'Do scheduled payments send automatically?' },
          { t: 'p', text: 'No. They are reminders. You review and sign each payment when it is due.' },
          { t: 'h3', text: 'Why do batch payments have no memo?' },
          { t: 'p', text: 'Batch rows are plain USDC transfers. Only payments sent through the contract carry an onchain memo.' },
        ],
      },
      {
        id: 'data',
        title: 'Data and privacy',
        blocks: [
          { t: 'h3', text: 'Where are my messages stored?' },
          { t: 'p', text: 'On the SocialPay server when a database is configured, and in your browser otherwise. They are not end-to-end encrypted.' },
          { t: 'h3', text: 'Is my payment history public?' },
          { t: 'p', text: 'Payments are onchain, so anyone can see them on Arc Explorer. Your Activity view is built from that public data plus notes stored locally.' },
        ],
      },
      {
        id: 'circle',
        title: 'Circle and integrations',
        blocks: [
          { t: 'h3', text: 'Does SocialPay use Circle wallets?' },
          { t: 'p', text: 'No. You connect your own wallet. See Circle Products and Integrations for what is used.' },
          { t: 'h3', text: 'Is SocialPay audited?' },
          { t: 'p', text: 'No independent audit report has been published. See Security Documentation.' },
        ],
      },
    ],
  },
  {
    slug: 'developers',
    title: 'Developer Resources',
    group: 'Reference',
    summary: 'Repository, network details, contract addresses, explorer links, architecture and integration guides.',
    sections: [
      {
        id: 'repository',
        title: 'Repository',
        blocks: [
          { t: 'links', items: [
            { label: 'GitHub repository', href: GITHUB_URL, note: 'Frontend, API routes, contract, tests and scripts.' },
            { label: 'ArcSocialPay.sol', href: GITHUB_CONTRACT_URL, note: 'Contract source.' },
            { label: 'Issues', href: GITHUB_ISSUES_URL, note: 'Bugs, questions and feature requests.' },
          ] },
          { t: 'code', lang: 'bash', text: 'git clone https://github.com/Optimusjishu5/Arcsocialpay.git\ncd Arcsocialpay\nbun install   # or: npm install\ncp .env.example .env\nbun run dev   # or: npm run dev' },
        ],
      },
      {
        id: 'arc',
        title: 'Arc Mainnet',
        blocks: [
          { t: 'facts' },
          { t: 'links', items: [
            { label: 'Arc Explorer', href: EXPLORER_URL, note: 'Transactions, addresses and blocks.' },
            { label: 'Arc documentation', href: 'https://docs.arc.io', note: 'Official network documentation.' },
          ] },
        ],
      },
      {
        id: 'addresses',
        title: 'Contract addresses',
        blocks: [
          { t: 'p', text: 'SocialPay deployments:' },
          { t: 'addresses', group: 'own' },
          { t: 'p', text: 'Contracts SocialPay talks to on Arc Mainnet:' },
          { t: 'addresses', group: 'protocol' },
          { t: 'callout', tone: 'info', text: 'Explorer source verification is not claimed for any address here. Open the address on Arc Explorer to check.' },
        ],
      },
      {
        id: 'architecture',
        title: 'Technical architecture',
        blocks: [{ t: 'diagram', id: 'architecture' }],
      },
      {
        id: 'environment',
        title: 'Environment variables',
        blocks: [
          { t: 'table', head: ['Variable', 'Purpose'], rows: [
            ['`NEXT_PUBLIC_ARC_RPC`', 'Override the Arc RPC URL. Defaults to the public Arc Mainnet RPC.'],
            ['`NEXT_PUBLIC_SOCIAL_PAY_ADDRESS`', 'Point the app at a different ArcSocialPay deployment. Rebuild after changing it.'],
            ['`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`', 'Enable server-side chat and social storage.'],
            ['`CHAT_SESSION_SECRET`', 'Secret that signs wallet sessions. Falls back to a key derived from the database token.'],
            ['`BLOCKSCOUT_API_KEY`', 'Optional. Lets the server read explorer history faster.'],
          ] },
          { t: 'callout', tone: 'warn', text: 'Keep secrets in `.env`, never in code, and never prefix them with `NEXT_PUBLIC_`.' },
        ],
      },
      {
        id: 'guides',
        title: 'Integration guides',
        blocks: [
          { t: 'h3', text: 'Link to a prefilled payment' },
          { t: 'p', text: 'Send people to the app with the recipient, and optionally an amount and a note, in the query string. The recipient must be a valid address.' },
          { t: 'code', lang: 'text', text: '/?pay=<recipient address>&amount=5&memo=Invoice%2042' },
          { t: 'h3', text: 'Read payments from the contract' },
          { t: 'p', text: 'Read `Payment` events with viem. The Arc RPC limits the block range of a log query, so scan in bounded windows starting at the contract creation block (24,774,515) rather than from block zero.' },
          { t: 'code', lang: 'ts', text: `import { createPublicClient, http, parseAbiItem } from 'viem'\n\nconst client = createPublicClient({ transport: http('https://rpc.mainnet.arc.io') })\nconst payment = parseAbiItem(\n  'event Payment(address indexed sender, address indexed recipient, uint256 amount, string memo)',\n)\n\nconst logs = await client.getLogs({\n  address: '${CONTRACT}',\n  event: payment,\n  fromBlock: 24_774_515n,\n  toBlock: 24_782_514n, // keep windows small, then advance\n})` },
          { t: 'h3', text: 'Pay through the contract' },
          { t: 'p', text: 'Approve USDC for the contract, then call `pay`. Amounts use 6 decimals.' },
          { t: 'code', lang: 'ts', text: `// 1. usdc.approve(socialPay, amount)\n// 2. socialPay.pay(recipient, amount, 'memo')\nimport { SOCIAL_PAY_ABI } from '@/contracts/arcSocialPay'` },
          { t: 'h3', text: 'Check a transaction' },
          { t: 'p', text: 'The app exposes `GET /api/tx?hash=0x...`, which checks the receipt, transaction and logs on the Arc node and decodes SocialPay events. `GET /api/health` reports the chain and whether the database is configured.' },
        ],
      },
      {
        id: 'contact',
        title: 'Developer contact',
        blocks: [
          { t: 'p', text: 'The maintainer contact for this project is its GitHub repository. Open an issue for bugs, questions or integration help.' },
          { t: 'links', items: [{ label: 'Open an issue', href: GITHUB_ISSUES_URL, note: 'No other contact channel is published.' }] },
        ],
      },
    ],
  },
]
