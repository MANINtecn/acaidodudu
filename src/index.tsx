import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'intro.js/introjs.css'; // Base styles (REQUIRED)
import 'intro.js/themes/introjs-modern.css'; // Modern Theme
import { registerPWA } from './pwa';

// --- DOM Exception Mismatch Safeguard (Prevents removeChild / insertBefore crashes from extensions/Google Translate) ---
if (typeof window !== 'undefined') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (console) console.warn('Ignored DOM removeChild mismatch:', child, this);
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (console) console.warn('Ignored DOM insertBefore mismatch:', referenceNode, this);
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
}

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