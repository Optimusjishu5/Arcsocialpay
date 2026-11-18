// The wallets that follow you, as last loaded from the server. Null until the server has answered.
let current: { me: string; list: string[] } | null = null

export function setFollowers(me: string, list: string[]): void { current = { me: me.toLowerCase(), list } }
export function getFollowers(me: string): string[] | null {
  return current && current.me === me.toLowerCase() ? current.list : null
}
export function clearFollowers(): void { current = null }
