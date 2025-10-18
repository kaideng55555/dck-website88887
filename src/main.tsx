import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');
ReactDOM.createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
