import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'intro.js/introjs.css'; // Base styles (REQUIRED)
import 'intro.js/themes/introjs-modern.css'; // Modern Theme
import { registerPWA } from './pwa';

registerPWA();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);