'use client'

import { useState } from 'react'
import { useDisconnect } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { ExternalLink, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react'
import { Button } from './ui/Button'
import { ARC_CHAIN_ID, useArcAccount } from '../hooks/useArcWallet'
import { ARC_EXPLORER_URL, ARC_RPC_URL } from '../chains'
import { NOTIF_RULES, useSettings } from '../hooks/useSettings'
import { useTheme } from '../store/appStore'
import { formatAddress } from '../utils/format'

const LOCAL_KEYS = ['arc-socialpay-v1', 'socialpay:scheduled:v1', 'socialpay:settings:v1']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>{title}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[28px]">
      <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-sm text-right min-w-0" style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
      style={{ background: checked ? 'var(--accent)' : 'var(--border-strong)' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
        style={{ left: checked ? 22 : 2 }} />
    </button>
  )
}

export function SettingsView() {
  const { address, isConnected, isArcChain, switchToArc, isSwitching, chainId } = useArcAccount()
  const { disconnect } = useDisconnect()
  const { theme, setTheme } = useTheme()
  const { rules, setRule } = useSettings()
  const [confirmClear, setConfirmClear] = useState(false)

  function clearLocalData() {
    try {
      LOCAL_KEYS.forEach((k) => window.localStorage.removeItem(k))
    } catch {
      /* storage unavailable */
    }
    window.location.reload()
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-4 pb-8 space-y-4">
      <h2 className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Settings</h2>

      <Section title="Network">
        <Row label="Network">Arc Mainnet</Row>
        <Row label="Chain ID"><span className="tabnum">{ARC_CHAIN_ID}</span></Row>
        <Row label="RPC"><span className="mono text-xs break-all">{ARC_RPC_URL}</span></Row>
        <Row label="Explorer">
          <a href={ARC_EXPLORER_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
            explorer.arc.io <ExternalLink size={12} />
          </a>
        </Row>
        <Row label="Gas token">USDC</Row>
        {isConnected && (
          isArcChain ? (
            <p className="text-xs" style={{ color: 'var(--success)' }}>Your wallet is on Arc Mainnet.</p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                Your wallet is on chain {chainId ?? 'unknown'}. Payments need Arc Mainnet.
              </p>
              <Button size="sm" onClick={switchToArc} loading={isSwitching}>Switch</Button>
            </div>
          )
        )}
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          SocialPay runs on Arc Mainnet only. There is no testnet toggle in this build.
        </p>
      </Section>

      <Section title="Wallet">
        {isConnected && address ? (
          <>
            <Row label="Connected"><span className="mono">{formatAddress(address)}</span></Row>
            <Button variant="secondary" className="w-full" onClick={() => disconnect()}>Disconnect wallet</Button>
          </>
        ) : (
          <ConnectKitButton />
        )}
      </Section>

      <Section title="Appearance">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
          {(['light', 'dark'] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)}
              className="h-10 rounded-lg text-sm font-semibold capitalize flex items-center justify-center gap-2"
              style={{
                background: theme === t ? 'var(--surface-strong)' : 'transparent',
                color: theme === t ? 'var(--ink)' : 'var(--muted)',
                boxShadow: theme === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
              {t === 'light' ? <Sun size={15} /> : <Moon size={15} />} {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Notifications">
        {NOTIF_RULES.map((r) => (
          <div key={r.type} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{r.label}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{r.hint}</p>
            </div>
            <Toggle checked={rules[r.type]} onChange={(v) => setRule(r.type, v)} label={`${r.label} notifications`} />
          </div>
        ))}
      </Section>

      <Section title="Security and data">
        <div className="flex gap-2 text-xs" style={{ color: 'var(--ink-2)' }}>
          <ShieldCheck size={16} className="flex-shrink-0" style={{ color: 'var(--success)' }} />
          <span>
            SocialPay never sees your private keys or seed phrase. Every payment is signed in your own wallet and you
            can check it on the explorer by transaction hash.
          </span>
        </div>
        {confirmClear ? (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              This removes chats, posts, payment history, reminders and settings saved in this browser. Your wallet and any
              onchain payments are not affected.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={clearLocalData}>Yes, clear</Button>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmClear(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setConfirmClear(true)}>
            <Trash2 size={14} /> Clear local data
          </Button>
        )}
      </Section>
    </div>
  )
}
