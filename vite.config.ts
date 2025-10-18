import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'buffer',
      '@solana/web3.js',
      '@solana/spl-token',
      '@solana/wallet-adapter-base',
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-react-ui',
      '@solana/wallet-adapter-wallets',
    ],
  },
});
