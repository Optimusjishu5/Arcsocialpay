// Shown for the moment the app's code is still arriving, so the screen is never blank.
// It uses the same colors and layout as the dashboard, so the real app replaces it without a jump.
export function AppLoading() {
  const block = { background: 'var(--surface-muted)' }
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }} aria-busy="true" aria-label="Loading SocialPay">
      <div className="flex h-14 items-center gap-2.5 px-4" style={{ background: 'var(--bar-bg)', borderBottom: '1px solid var(--border)' }}>
        <div className="h-[30px] w-[30px] rounded-lg" style={block} />
        <div className="h-4 w-24 rounded-full" style={block} />
      </div>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4">
        <div className="h-[200px] animate-pulse rounded-[28px]" style={block} />
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-2xl" style={block} />)}
        </div>
        <div className="h-40 animate-pulse rounded-3xl" style={block} />
      </div>
    </div>
  )
}
