import React, { useEffect, useRef, useState } from 'react';

/**
 * BootCheckModal — tela de "CONFIGURANDO AMBIENTE" no boot do Electron.
 *
 * BUG HISTORICO (23/09/2026): campo nenhum aceitava clique/digitar na
 * primeira abertura do app, o operador so conseguia depois de minimizar e
 * restaurar a janela ("gambiarra"). A correcao anterior no main.js usava um
 * timeout fixo de 300ms apos o carregamento da pagina, mas isso e um chute:
 * 'did-finish-load' dispara quando o HTML/JS carregou, NAO quando o React
 * terminou de montar algo focavel. Em boot mais lento (disco frio, Supabase
 * demorando, balanca varrendo portas Bluetooth mortas) o timeout nao bastava
 * e o sintoma voltava.
 *
 * Este componente troca o timeout adivinhado por uma CONFIRMACAO REAL:
 * 1. Mostra "CONFIGURANDO AMBIENTE" cobrindo a tela (bloqueio de proposito,
 *    com aviso, em vez de silencio).
 * 2. Foca programaticamente um input oculto e confirma de verdade que
 *    `document.activeElement` e esse input — prova que o foco chegou no
 *    webContents, nao so a suposicao de tempo.
 * 3. Em paralelo, tenta conectar a balanca (USB, ja sem Bluetooth — ver
 *    scaleService.ts) com prazo curto; falha da balanca NAO bloqueia o
 *    Balcao, so mostra aviso.
 * 4. Confirmado o foco, avisa o main.js (`confirmarFocoOk`) e libera a tela.
 *    Se o main.js nao receber essa confirmacao a tempo, ele reinicia o app
 *    sozinho (ate 2 vezes). Na 3a falha seguida, o main.js manda
 *    'ambiente-falhou-definitivo' e este componente troca a mensagem para
 *    pedir acao manual (minimizar/restaurar ou fechar e abrir de novo).
 *
 * So roda dentro do Electron — no navegador comum (loja online) nunca
 * aparece.
 */

const FOCUS_TEST_TENTATIVAS = 6;
const FOCUS_TEST_INTERVALO_MS = 200;
const SCALE_TIMEOUT_MS = 6000;

type Etapa = 'testando' | 'pronto' | 'falhou-definitivo';

interface Props {
  isScaleEnabled?: boolean;
  scaleBaudRate?: number;
}

const BootCheckModal: React.FC<Props> = ({ isScaleEnabled, scaleBaudRate }) => {
  const [etapa, setEtapa] = useState<Etapa>('testando');
  const [scaleStatusText, setScaleStatusText] = useState('Verificando balança...');
  const focusInputRef = useRef<HTMLInputElement>(null);
  const jaConfirmouRef = useRef(false);

  // Escuta o main.js avisando que ja reiniciou 2x e vai desistir de tentar
  // sozinho — troca a mensagem para pedir acao manual, mesmo se o teste de
  // foco ainda estiver rodando.
  useEffect(() => {
    const api = (window as any).electron;
    if (!api?.onAmbienteFalhouDefinitivo) return;
    api.onAmbienteFalhouDefinitivo(() => {
      setEtapa('falhou-definitivo');
    });
  }, []);

  // Teste de foco real: tenta focar o input oculto e confirma via
  // document.activeElement (nao um `setTimeout` as cegas). Repete algumas
  // vezes porque o primeiro paint pode acontecer antes do elemento existir
  // de fato no DOM.
  useEffect(() => {
    let tentativa = 0;
    let cancelado = false;

    const tentar = () => {
      if (cancelado || jaConfirmouRef.current) return;
      tentativa++;

      const input = focusInputRef.current;
      if (input) {
        input.focus();
        if (document.activeElement === input) {
          jaConfirmouRef.current = true;
          const api = (window as any).electron;
          api?.confirmarFocoOk?.();
          setEtapa('pronto');
          return;
        }
      }

      if (tentativa < FOCUS_TEST_TENTATIVAS) {
        setTimeout(tentar, FOCUS_TEST_INTERVALO_MS);
      }
      // Se esgotar as tentativas sem confirmar, simplesmente NAO chama
      // confirmarFocoOk() — o main.js vai reiniciar sozinho apos o timeout
      // dele (ver FOCO_CONFIRMACAO_TIMEOUT_MS no main.js).
    };

    tentar();
    return () => { cancelado = true; };
  }, []);

  // Teste da balança: so informativo, nunca bloqueia a liberacao do Balcao.
  useEffect(() => {
    if (!isScaleEnabled) {
      setScaleStatusText('Balança desativada nas configurações.');
      return;
    }

    let cancelado = false;
    setScaleStatusText('Procurando balança (USB)...');

    import('../services/scaleService').then(({ connectScale, getScaleSnapshot }) => {
      if (cancelado) return;
      connectScale(scaleBaudRate || 9600, false).finally(() => {
        if (cancelado) return;
        const status = getScaleSnapshot().status;
        if (status === 'stable' || status === 'unstable' || status === 'waiting') {
          setScaleStatusText('Balança conectada.');
        } else {
          setScaleStatusText('Balança não encontrada — use "Conectar USB" no Balcão.');
        }
      });
    });

    const timeoutId = setTimeout(() => {
      if (cancelado) return;
      setScaleStatusText((atual) =>
        atual === 'Procurando balança (USB)...'
          ? 'Balança demorou a responder — use "Conectar USB" no Balcão.'
          : atual
      );
    }, SCALE_TIMEOUT_MS);

    return () => { cancelado = true; clearTimeout(timeoutId); };
  }, [isScaleEnabled, scaleBaudRate]);

  if (etapa === 'pronto') return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/97 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Input oculto, fora da tela — existe só para o teste de foco real. */}
      <input
        ref={focusInputRef}
        type="text"
        readOnly
        aria-hidden="true"
        tabIndex={-1}
        className="absolute w-px h-px opacity-0 pointer-events-none -left-full"
      />

      <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
        {etapa === 'testando' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <h1 className="text-lg font-black uppercase tracking-widest text-white mb-2">
              Configurando Ambiente
            </h1>
            <p className="text-sm text-slate-400 mb-1">Preparando os campos de digitação...</p>
            <p className="text-xs text-slate-500">{scaleStatusText}</p>
          </>
        )}

        {etapa === 'falhou-definitivo' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center text-3xl font-black">
              !
            </div>
            <h1 className="text-lg font-black uppercase tracking-widest text-white mb-2">
              Não foi possível preparar a tela
            </h1>
            <p className="text-sm text-slate-300 mb-1">
              O sistema tentou se ajustar sozinho e não conseguiu.
            </p>
            <p className="text-sm text-slate-300">
              Minimize e abra a janela de novo, ou feche o programa e abra novamente.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default BootCheckModal;
