import type { DocPage } from '../types'

export const PAYMENT_PAGES: DocPage[] = [
  {
    slug: 'send-receive-usdc',
    title: 'Send and Receive USDC',
    group: 'Using SocialPay',
    summary: 'How a payment works, why an approval is needed, and how to receive money.',
    sections: [
      {
        id: 'sending',
        title: 'Sending',
        blocks: [
          { t: 'ol', items: [
            'Open Pay and enter a recipient address, an amount in USDC and an optional note of up to 100 characters.',
            'The app validates the address and amount. It rejects the zero address, the USDC contract, your own address and amounts with more than 6 decimals.',
            'Review the preview, then confirm. Your wallet asks you to sign.',
            'SocialPay waits for the receipt, checks it on the Arc node and records the payment in Activity.',
          ] },
          { t: 'p', text: 'A single payment calls `pay(recipient, amount, memo)` on the ArcSocialPay contract. The memo is stored as a `Payment` event, which plain ERC-20 transfers cannot do. Tips on posts call `tip(recipient, amount, postId)` the same way.' },
          { t: 'diagram', id: 'payment-flow' },
        ],
      },
      {
        id: 'approvals',
        title: 'USDC approvals',
        blocks: [
          { t: 'p', text: 'The contract moves USDC with `transferFrom`, so your wallet must first approve it. Settings lets you choose how much to approve at a time.' },
          { t: 'table', head: ['Choice', 'What happens'], rows: [
            ['Exact', 'Each payment approves only its own amount. Safest, but every payment needs an approval transaction.'],
            ['A limit ($50, $100, $500, $1,000 or custom up to $1,000,000)', 'The first payment approves up to the limit, so later payments within it need no extra approval.'],
          ] },
          { t: 'p', text: 'Settings also shows the allowance the contract has left, read from Arc, and lets you take it back by setting it to zero.' },
          { t: 'callout', tone: 'info', title: 'Why the contract is safe to approve', text: 'ArcSocialPay forwards USDC to the recipient in the same call and keeps nothing. See Smart Contract Architecture for the full list of protections.' },
        ],
      },
      {
        id: 'receiving',
        title: 'Receiving',
        blocks: [
          { t: 'p', text: 'Share your wallet address, or create a payment request link in Pay. USDC arrives straight in your wallet. Home and Activity show it once Arc confirms it.' },
          { t: 'p', text: 'Anyone can also send you plain USDC from any wallet. Those payments have no memo but still appear in Activity, because Activity reads your history from Arc.' },
        ],
      },
      {
        id: 'fees',
        title: 'Fees',
        blocks: [
          { t: 'ul', items: [
            'SocialPay and the ArcSocialPay contract charge no fee.',
            'You pay Arc network gas in USDC. The wallet shows the exact amount before you sign.',
            'The app keeps a small USDC reserve when you swap, so gas is never spent down to zero by accident.',
          ] },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'If a payment fails',
        blocks: [
          { t: 'ul', items: [
            'Wrong network: switch to Arc Mainnet when prompted.',
            'Insufficient balance: the amount plus gas must fit in your USDC balance.',
            'Paused contract: the owner can pause new payments. Reads keep working and no funds are held.',
            'Rejected in wallet: nothing was sent. Try again.',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'batch-split-payments',
    title: 'Batch and Split Payments',
    group: 'Using SocialPay',
    summary: 'Pay many people from a CSV, or split a bill into payment links.',
    sections: [
      {
        id: 'batch',
        title: 'Batch payments',
        blocks: [
          { t: 'p', text: 'Batch lets you pay up to 50 recipients in one session. Add rows by hand or paste CSV with one `address,amount` pair per line. A header line, and comma, semicolon or tab separators, are accepted.' },
          { t: 'code', text: 'address,amount\n0x1111111111111111111111111111111111111111,5.00\n0x2222222222222222222222222222222222222222,12.50' },
          { t: 'p', text: 'The code above shows the format only. Replace the addresses with real ones.' },
          { t: 'ol', items: [
            'Add recipients. Each row is checked and invalid rows are explained.',
            'Review the list and the total against your balance.',
            'Confirm. Each row is sent as its own USDC transfer and its own wallet signature, in order.',
          ] },
          { t: 'callout', tone: 'warn', title: 'How batches behave', text: 'Rows are separate transactions, not one atomic transaction. The batch stops at the first failure so nothing is sent out of order, and finished rows stay finished. Batch rows are plain USDC transfers and do not go through the ArcSocialPay contract, so they carry no onchain memo.' },
        ],
      },
      {
        id: 'split',
        title: 'Split a bill',
        blocks: [
          { t: 'p', text: 'Enter the total you paid and how many people share it. SocialPay divides it equally with exact integer math and builds one payment request link for each share. Share the link; each person opens it and pays you.' },
          { t: 'p', text: 'Links created by Split carry a marker so the payer\'s history can label the payment as a split payment.' },
        ],
      },
      {
        id: 'limits',
        title: 'Limits',
        blocks: [
          { t: 'table', head: ['Item', 'Limit'], rows: [
            ['Rows in a batch', '50'],
            ['Amount precision', '6 decimals'],
            ['Note length', '100 characters in the app'],
          ] },
        ],
      },
    ],
  },
  {
    slug: 'requests-scheduling',
    title: 'Payment Requests and Scheduling',
    group: 'Using SocialPay',
    summary: 'Share a request link, set an expiry, and keep recurring reminders.',
    sections: [
      {
        id: 'requests',
        title: 'Payment requests',
        blocks: [
          { t: 'p', text: 'A request is a link back to SocialPay that carries your address and, optionally, an amount, a note and an expiry. When someone opens it, the Pay screen is pre-filled and they review and sign.' },
          { t: 'code', text: '/?pay=<recipient address>&amount=5&memo=Lunch&exp=<unix seconds>' },
          { t: 'ul', items: [
            'The recipient must be a valid address. Amount and note are validated before they fill the form.',
            'Expiry options are none, 1 hour, 24 hours, 7 days or 30 days.',
            'Expiry is a courtesy shown to the payer. It is not enforced onchain.',
            'Links never contain secrets or private keys.',
          ] },
        ],
      },
      {
        id: 'scheduling',
        title: 'Scheduled payments',
        blocks: [
          { t: 'p', text: 'Schedule lets you set a once, daily, weekly or monthly payment. These are reminders stored in your browser.' },
          { t: 'callout', tone: 'warn', title: 'Reminders, not automation', text: 'SocialPay never sends a payment on its own. When a scheduled payment is due, you review and sign it yourself. Because the data lives in your browser, clearing site data removes your reminders.' },
        ],
      },
    ],
  },
  {
    slug: 'messaging-social',
    title: 'Messaging and Social Features',
    group: 'Using SocialPay',
    summary: 'Chat, pay inside a conversation, join groups and use the social feed.',
    sections: [
      {
        id: 'messages',
        title: 'Direct messages',
        blocks: [
          { t: 'p', text: 'Start a conversation with a wallet address and chat. You can reply to a message, delete a message for yourself, and send a USDC payment from inside the chat.' },
          { t: 'p', text: 'In-chat payments use the same Pay flow and contract as the Pay screen, so they get the same onchain memo and receipt.' },
        ],
      },
      {
        id: 'privacy',
        title: 'Chat privacy and signatures',
        blocks: [
          { t: 'ul', items: [
            'When a database is configured, each message is signed by your wallet (EIP-712) so the server can verify who sent it.',
            'Reading private chat data needs a wallet-signed session. The address that decides what you may read always comes from the verified session, never from a request you could edit.',
            'Signing a message does not move funds and costs no gas.',
            'Without a database, chat stays in your browser and no signature prompt appears.',
          ] },
          { t: 'callout', tone: 'info', text: 'Messages are not end-to-end encrypted. The server that stores chat history can read it. Do not share secrets in chat.' },
        ],
      },
      {
        id: 'groups',
        title: 'Groups and channels',
        blocks: [
          { t: 'p', text: 'A group is a shared conversation. A channel is a broadcast space where only admins post. You can create, join and leave both from Messages.' },
        ],
      },
      {
        id: 'feed',
        title: 'Social feed',
        blocks: [
          { t: 'ul', items: [
            'Post, like, comment and repost in Explore.',
            'Follow people to see their posts.',
            'Tip an author in USDC. A tip calls the ArcSocialPay contract with the post id, so the tip is recorded onchain.',
            'A post counts as saved only after the server confirms it.',
          ] },
        ],
      },
      {
        id: 'profiles',
        title: 'Profiles and notifications',
        blocks: [
          { t: 'p', text: 'Your profile has a display name, username, bio and optional photo. Alerts lists payments received and social activity that involves you.' },
        ],
      },
    ],
  },
]
