// Roadmap shown on the landing page. "Shipped" items exist in this repository today.
// "Next" items are goals drawn from known gaps in the current app. They are not dated
// commitments: edit this file to match what the team actually plans.

export interface RoadmapItem {
  title: string
  text: string
}

export const SHIPPED: RoadmapItem[] = [
  { title: 'Payments on Arc Mainnet', text: 'Send, request, split and batch USDC with an optional memo.' },
  { title: 'ArcSocialPay contract', text: 'Pull-payment contract for memo payments and post tips, deployed on Arc Mainnet.' },
  { title: 'Messaging and social feed', text: 'Direct messages with in-chat pay, groups, posts, likes, comments and follows.' },
  { title: 'Swap', text: 'Uniswap v3, KyberSwap, LI.FI and Circle App Kit routes for tokens on Arc.' },
  { title: 'Bridge', text: 'Circle CCTP plus a LI.FI, Across and Relay comparison for moving USDC to and from Arc.' },
  { title: 'Full activity history', text: 'Your complete onchain history on Arc, searchable, with CSV export.' },
]

export const NEXT: RoadmapItem[] = [
  { title: 'Explorer source verification', text: 'Publish verified source for ArcSocialPay on Arc Explorer so anyone can read it there.' },
  { title: 'Independent security review', text: 'Commission an outside audit of the contract and publish the report when it exists.' },
  { title: 'Automated recurring payments', text: 'Today scheduled payments are reminders you sign yourself. Automation would need a new, reviewed contract.' },
  { title: 'More bridge recognition', text: 'Show bridges made through Across, Relay and LI.FI in Activity. Only CCTP burns are recognised from chain data today.' },
]
