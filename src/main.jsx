import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // This MUST be './App', not './AppRouter'
import { registerPWA } from "./services/pwa";
import "./index.css";
import "./styles/theme.css"; // shared theme tokens (all modules)

// installable app: service worker (offline shell + push) and the install offer
registerPWA();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);