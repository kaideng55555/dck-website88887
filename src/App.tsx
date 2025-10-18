\
'use client';
/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useMemo, useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { Buffer } from 'buffer';
import { Connection, PublicKey, Transaction, Keypair, SystemProgram, clusterApiUrl } from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import * as splToken from '@solana/spl-token';

if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
  (globalThis as any).process = (globalThis as any).process || { env: { NODE_ENV: 'production' } };
}

// UI primitives
const Btn = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={'rounded px-3 py-2 text-sm bg-white/10 hover:bg-white/20 border border-white/10 ' + (p.className || '')} />
);
const Card = (p: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...p} className={'rounded-2xl border border-white/10 bg-black/20 ' + (p.className || '')} />
);
const H = ({ children }: { children: ReactNode }) => <h3 className="p-4 pb-0 text-base font-semibold">{children}</h3>;
const C = ({ children }: { children: ReactNode }) => <div className="p-4 pt-2">{children}</div>;
const F = ({ children }: { children: ReactNode }) => <div className="p-4 border-t border-white/10">{children}</div>;
const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={'w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:ring ' + (p.className || '')} />
);
const Label = (p: React.HTMLAttributes<HTMLLabelElement>) => (<label {...p} className={'text-xs text-neutral-400 ' + (p.className || '')} />);

// helpers
const toast = (t: string, d?: string) => typeof window !== 'undefined' && alert(d ? `${t}\n${d}` : t);
export const isPk = (s: string) => { try { new PublicKey(s); return true; } catch { return false; } };
export const toBase = (ui: string | number, d: number) => {
  const c = String(ui ?? '').replace(/,/g, '').trim();
  if (!/^\d*(?:\.\d*)?$/.test(c)) throw new Error('invalid number');
  const [i = '0', fRaw = ''] = c.split('.');
  const f = (fRaw + '0'.repeat(d)).slice(0, d);
  const n = Number(i + f);
  if (!Number.isFinite(n)) throw new Error('not finite');
  if (n > Number.MAX_SAFE_INTEGER) throw new Error('too big');
  return Math.max(0, Math.floor(n));
};
export const lamportsToSol = (l: number) => (l / 1_000_000_000).toFixed(9).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
function requireSigner(w: any) { if (!w || !w.publicKey || !w.signTransaction) throw new Error('Connect wallet'); return { publicKey: w.publicKey as PublicKey, signTransaction: w.signTransaction as any }; }

// connection
const net = (n: WalletAdapterNetwork) => (n === WalletAdapterNetwork.Devnet ? 'devnet' : n === WalletAdapterNetwork.Testnet ? 'testnet' : 'mainnet-beta');
const useConn = (rpc?: string, n: WalletAdapterNetwork = WalletAdapterNetwork.Mainnet) => {
  const endpoint = useMemo(() => rpc || clusterApiUrl(net(n)), [rpc, n]);
  const conn = useMemo(() => new Connection(endpoint, { commitment: 'confirmed' }), [endpoint]);
  return { conn, endpoint };
};

// cfg context
const TOKEN_KEY = 'kidwiftools.token';
const Ctx = createContext<{ cfg: { mint: string; decimals: number; symbol: string; keepAuth: boolean }; setCfg: (v: any) => void }>(
  { cfg: { mint: '', decimals: 9, symbol: 'KID$', keepAuth: true }, setCfg: () => {} }
);
const TokenCfgProvider = ({ children }: { children: ReactNode }) => {
  const [cfg, setCfg] = useState(() => {
    try {
      if (typeof window === 'undefined') return { mint: '', decimals: 9, symbol: 'KID$', keepAuth: true };
      const r = localStorage.getItem(TOKEN_KEY);
      return r ? JSON.parse(r) : { mint: '', decimals: 9, symbol: 'KID$', keepAuth: true };
    } catch { return { mint: '', decimals: 9, symbol: 'KID$', keepAuth: true }; }
  });
  useEffect(() => { try { if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, JSON.stringify(cfg)); } catch {} }, [cfg]);
  return <Ctx.Provider value={{ cfg, setCfg }}>{children}</Ctx.Provider>;
};
const useCfg = () => useContext(Ctx);

// spl helpers
const getAta = async (mint: PublicKey, owner: PublicKey, allowOwnerOffCurve = false) => 
  await splToken.getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve, splToken.TOKEN_PROGRAM_ID, splToken.ASSOCIATED_TOKEN_PROGRAM_ID);
const ensureAtaIx = (ata: PublicKey, payer: PublicKey, owner: PublicKey, mint: PublicKey) =>
  splToken.createAssociatedTokenAccountInstruction(payer, ata, owner, mint, splToken.TOKEN_PROGRAM_ID, splToken.ASSOCIATED_TOKEN_PROGRAM_ID);

// Tool: Token Settings
const TokenSettings = () => {
  const { cfg, setCfg } = useCfg();
  const { conn } = useConn();
  const [mint, setMint] = useState(cfg.mint);
  const [dec, setDec] = useState(cfg.decimals);
  const [sym, setSym] = useState(cfg.symbol);
  const [keep, setKeep] = useState(cfg.keepAuth);
  const [busy, setBusy] = useState(false);

  const detect = useCallback(async () => {
    try {
      if (!isPk(mint)) return toast('Enter a valid mint');
      setBusy(true);
      const mi = await splToken.getMint(conn, new PublicKey(mint));
      setDec(mi.decimals);
      toast('Detected', `decimals: ${mi.decimals}`);
    } catch (e: any) { toast('Detect failed', String(e?.message || e)); }
    finally { setBusy(false); }
  }, [conn, mint]);

  const save = useCallback(() => {
    try {
      if (mint && !isPk(mint)) throw new Error('mint invalid');
      setCfg({ mint, decimals: Number(dec) || 0, symbol: sym || 'KID$', keepAuth: !!keep });
      toast('Saved', `${sym || 'KID$'} • ${mint || '(none)'}`);
    } catch (e: any) { toast('Save failed', String(e?.message || e)); }
  }, [mint, dec, sym, keep, setCfg]);

  return (
    <Card>
      <H>Token Settings</H>
      <C>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label>Mint</Label>
            <Input value={mint} onChange={(e) => setMint((e.target as HTMLInputElement).value)} placeholder="mint address" />
          </div>
          <div>
            <Label>Symbol</Label>
            <Input value={sym} onChange={(e) => setSym((e.target as HTMLInputElement).value)} placeholder="KID$" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 mt-3">
          <div>
            <Label>Decimals</Label>
            <Input type="number" value={dec} onChange={(e) => setDec(parseInt((e.target as HTMLInputElement).value || '0'))} />
          </div>
          <div className="md:col-span-2 flex items-center gap-2 mt-6">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep((e.target as HTMLInputElement).checked)} />
            <Label>Keep authorities</Label>
          </div>
        </div>
      </C>
      <F>
        <Btn onClick={detect} disabled={busy || !isPk(mint)}>{busy ? '…' : 'Detect'}</Btn>
        <Btn onClick={save} className="ml-2">Save</Btn>
      </F>
    </Card>
  );
};

// Grid & App
const Grid = () => (
  <div className="grid grid-cols-1 gap-4">
    <TokenSettings />
  </div>
);

const Tools = () => {
  const { endpoint } = useConn();
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded bg-white/10" />
        <span className="text-xs text-neutral-400">Endpoint: {endpoint}</span>
      </div>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <div className="mb-4"><WalletMultiButton /></div>
            <TokenCfgProvider>
              <Grid />
            </TokenCfgProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </div>
  );
};

export default function App() {
  return (
    <div className="min-h-screen text-white bg-gradient-to-b from-neutral-900 to-black">
      <Tools />
    </div>
  );
}
