import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'intro.js/introjs.css'; // Base styles (REQUIRED)
import 'intro.js/themes/introjs-modern.css'; // Modern Theme
import { registerPWA } from './pwa';
import { carregarConfigEstacao, dumpConfigEstacao } from './services/estacaoService';

// Configuracao de impressao/som DESTA maquina (salao / cozinha).
//
// A promessa fica solta de proposito: o React nao deve esperar o disco para
// pintar a tela. Quem depende disto (estacaoDeveTocar) checa
// estacaoFoiCarregada() e fica em SILENCIO ate a config chegar — antes,
// enquanto a promessa nao resolvia, toda maquina tocava.
carregarConfigEstacao();

// Suporte: com o app aberto, Ctrl+Shift+I e `pdvEstacao()` mostram o que ESTA
// maquina tem salvo no disco. Evita pedir print de tela de configuracao.
(window as any).pdvEstacao = dumpConfigEstacao;

// Baixa o som do alerta uma vez, no boot. Assim o primeiro pedido do dia nao
// espera o download — e se a internet cair depois, o som continua tocando.
import('./services/sireneService').then(m => m.precarregarSirene()).catch(() => {});

// FOCO ROUBADO (05/10/2026): no Electron/Windows, toda caixa nativa
// (alert/confirm/prompt) deixa a pagina sem teclado ao fechar -- o "tem que
// minimizar e voltar". Sao ~130 caixas no app; em vez de trocar uma a uma,
// cada uma passa a pedir ao main.js para devolver o foco logo apos fechar.
// No site (sem window.electron) nada muda.
if (typeof window !== 'undefined' && (window as any).electron?.refocarJanela) {
  const refocar = () => { try { (window as any).electron.refocarJanela(); } catch { /* sem IPC */ } };
  const alertOriginal = window.alert.bind(window);
  const confirmOriginal = window.confirm.bind(window);
  const promptOriginal = window.prompt.bind(window);
  window.alert = (msg?: any) => { try { alertOriginal(msg); } finally { refocar(); } };
  window.confirm = (msg?: string) => { try { return confirmOriginal(msg); } finally { refocar(); } };
  window.prompt = (msg?: string, padrao?: string) => { try { return promptOriginal(msg, padrao); } finally { refocar(); } };
}

// --- DOM Exception Mismatch Safeguard (Prevents removeChild / insertBefore crashes from extensions/Google Translate) ---
if (typeof window !== 'undefined') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (console) console.warn('Ignored DOM removeChild mismatch:', child, this);
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (console) console.warn('Ignored DOM insertBefore mismatch:', referenceNode, this);
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
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