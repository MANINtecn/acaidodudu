/**
 * scaleService — Leitura de balança via Web Serial (Urano US 31/2 POS)
 *
 * REGRA DE OURO DESTE ARQUIVO: é preferível NÃO mostrar peso a mostrar peso errado.
 * Nenhuma função aqui pode "adivinhar" um peso a partir de dados incompletos.
 * Ver claude-acai.md, seção BALANÇA.
 */

export interface ScaleReadResult {
  weightKg: number;
  isStable: boolean;
  raw: string;
  error?: string;
}

export type ScaleProtocol = 'urano' | 'toledo' | 'filizola' | 'elgin' | 'generic';

/** Estado da conexão contínua (stream), exposto para a UI. */
export type ScaleStatus =
  | 'disconnected'   // nenhuma porta selecionada
  | 'connecting'     // abrindo porta
  | 'waiting'        // porta aberta, mas nenhum frame válido ainda
  | 'unstable'       // recebendo peso, mas balança ainda oscilando
  | 'stable'         // peso estável e confiável
  | 'error';

export interface ScaleSnapshot {
  status: ScaleStatus;
  weightKg: number;
  isStable: boolean;
  /** Última linha bruta recebida da balança (diagnóstico). */
  lastRaw: string;
  errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────────────────────

/**
 * Frame da Urano US 31/2 POS (e da maioria das balanças de balcão).
 *
 * Um frame é uma LINHA COMPLETA, delimitada por CR (\r), LF (\n) ou por
 * STX(\x02)…ETX(\x03). Só interpretamos linha fechada — nunca um pedaço.
 *
 * Formatos aceitos:
 *   "ST,GS,   0.450kg"   -> estável, 0.450
 *   "US,GS,   0.450kg"   -> instável (US = UNSTABLE)
 *   "\x02 0.450\x03"     -> 0.450
 *   "  0.450 kg"         -> 0.450
 *   "000450"             -> 0.450 (5-6 dígitos, gramas, sem separador decimal)
 */

/** Peso máximo aceito (kg). A US 31/2 POS é de 30 kg; acima disso é lixo. */
const MAX_WEIGHT_KG = 30;

export interface ParsedFrame {
  weightKg: number;
  isStable: boolean;
  /** false = o frame não é interpretável; NÃO usar o peso. */
  valid: boolean;
}

/**
 * Interpreta UM frame já delimitado. Retorna valid:false quando não tem
 * certeza — o chamador deve descartar, nunca aproveitar parcialmente.
 */
export function parseScaleFrame(frame: string): ParsedFrame {
  const invalid: ParsedFrame = { weightKg: 0, isStable: false, valid: false };
  if (!frame) return invalid;

  // Remove delimitadores de controle, mantém o conteúdo.
  const clean = frame.replace(/[\x02\x03\r\n\x00]/g, '').trim();
  if (!clean) return invalid;

  // Flag de estabilidade: só vale como TOKEN delimitado, nunca como substring
  // solta (senão a palavra "Urano" ou lixo contendo "us" contamina a leitura).
  const upper = clean.toUpperCase();
  const hasUnstableToken = /(^|[,\s])US([,\s]|$)/.test(upper);
  const hasStableToken = /(^|[,\s])ST([,\s]|$)/.test(upper);
  // Há balanças que NUNCA enviam flag (é o caso da Urano US 31/2 POS deste
  // cliente: responde só "STX + 5 dígitos + ETX"). Nesses frames a estabilidade
  // não vem do protocolo — quem garante é a confirmação por repetição no
  // runReadLoop (STABLE_CONFIRMATIONS). Ver claude-acai.md, Regra 6.
  const semFlag = !hasStableToken && !hasUnstableToken;

  // 0) Frame puro: SOMENTE dígitos entre STX/ETX, em gramas.
  //    Ex.: \x02 0 0 2 2 2 \x03  ->  0.222 kg  (medido na balança do cliente)
  if (/^\d{5,6}$/.test(clean)) {
    const grams = parseInt(clean, 10);
    if (!isNaN(grams)) {
      const val = grams / 1000;
      if (val >= 0 && val <= MAX_WEIGHT_KG) {
        return { weightKg: val, isStable: true, valid: true };
      }
    }
    return invalid;
  }

  // 1) Número com separador decimal: 0.450 / 0,450 / 12.35
  const decimal = clean.match(/(\d{1,3})[.,](\d{2,3})(?!\d)/);
  if (decimal) {
    const val = parseFloat(`${decimal[1]}.${decimal[2]}`);
    if (!isNaN(val) && val >= 0 && val <= MAX_WEIGHT_KG) {
      // Se a balança não declarou estabilidade, assumimos INSTÁVEL.
      // Nunca tratar ausência de informação como "estável".
      // Com flag: obedece a flag. Sem flag nenhuma: a estabilidade fica por
      // conta da confirmação por repetição (ver semFlag acima).
      return { weightKg: val, isStable: semFlag || (hasStableToken && !hasUnstableToken), valid: true };
    }
    return invalid;
  }

  // 2) Só dígitos, em gramas. Exige que os 5-6 dígitos formem o campo INTEIRO,
  //    assim um frame cortado não vira peso aleatório.
  const digits = clean.match(/(?:^|[,\s])(\d{5,6})(?:[,\s]|KG|G|$)/i);
  if (digits) {
    const grams = parseInt(digits[1], 10);
    if (!isNaN(grams)) {
      const val = grams / 1000;
      if (val >= 0 && val <= MAX_WEIGHT_KG) {
        // Com flag: obedece a flag. Sem flag nenhuma: a estabilidade fica por
      // conta da confirmação por repetição (ver semFlag acima).
      return { weightKg: val, isStable: semFlag || (hasStableToken && !hasUnstableToken), valid: true };
      }
    }
  }

  return invalid;
}

/**
 * Compat: mantida para não quebrar chamadas existentes.
 * Retorna 0 quando o frame não é confiável.
 */
export function parseUranoWeight(data: string): number {
  const p = parseScaleFrame(data);
  return p.valid ? p.weightKg : 0;
}

export function parseToledoWeight(data: string): number {
  return parseUranoWeight(data);
}

export function parseScaleWeight(rawData: string, _protocol: ScaleProtocol = 'urano'): ScaleReadResult {
  const p = parseScaleFrame(rawData);
  return {
    weightKg: p.valid ? Number(p.weightKg.toFixed(3)) : 0,
    isStable: p.valid && p.isStable,
    raw: rawData
  };
}

// ─────────────────────────────────────────────────────────────
// CONEXÃO CONTÍNUA (stream) — substitui o polling que travava a porta
// ─────────────────────────────────────────────────────────────

let activeSerialPort: any = null;
let activeReader: any = null;
let readLoopRunning = false;
let keepReading = false;

/** Quantas leituras iguais seguidas exigimos antes de declarar peso confiável. */
const STABLE_CONFIRMATIONS = 3;

let lastWeight = 0;
let sameWeightCount = 0;

let snapshot: ScaleSnapshot = {
  status: 'disconnected',
  weightKg: 0,
  isStable: false,
  lastRaw: ''
};

type SnapshotListener = (s: ScaleSnapshot) => void;
const listeners = new Set<SnapshotListener>();

/** Buffer circular das últimas linhas cruas — alimenta o modo diagnóstico. */
const rawLog: string[] = [];
const RAW_LOG_MAX = 300;

export function getScaleSnapshot(): ScaleSnapshot {
  return snapshot;
}

/** Linhas cruas recebidas da balança, mais recentes por último. */
export function getScaleRawLog(): string[] {
  return [...rawLog];
}

export function clearScaleRawLog(): void {
  rawLog.length = 0;
}

/** Inscreve a UI para receber cada atualização de peso. Retorna o unsubscribe. */
export function subscribeToScale(listener: SnapshotListener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

function emit(patch: Partial<ScaleSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => {
    try {
      l(snapshot);
    } catch (_) {}
  });
}

function pushRaw(line: string) {
  const trimmed = line.replace(/[\x00]/g, '').trim();
  if (!trimmed) return;
  rawLog.push(`${new Date().toLocaleTimeString('pt-BR')}  ${trimmed}`);
  if (rawLog.length > RAW_LOG_MAX) rawLog.shift();
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Abre a porta e mantém o stream vivo, empurrando o peso para a UI.
 * Diferente da versão anterior, a porta é aberta UMA vez — não há
 * getReader/cancel a cada 800 ms (origem dos PORT_LOCKED).
 */
/**
 * Algumas balanças (a Urano US 31/2 POS do cliente entre elas) NÃO transmitem
 * sozinhas: ficam mudas até receberem ENQ (0x05), e então respondem UM frame.
 * Este timer faz o pedido periodicamente. Em balanças de transmissão contínua
 * o ENQ extra é inofensivo.
 */
let enqTimer: any = null;
// 400 ms enfileirava respostas mais rapido do que o loop consumia, atrasando a
// tela. 600 ms mantem a leitura fluida sem acumular fila.
const ENQ_INTERVAL_MS = 600;

let enqEnviados = 0;
let enqFalhas = 0;

async function sendEnq(port: any) {
  if (!port?.writable) {
    if (enqFalhas++ % 20 === 0) pushRaw('[enq] porta sem canal de escrita');
    return;
  }
  if (port.writable.locked) {
    if (enqFalhas++ % 20 === 0) pushRaw('[enq] canal de escrita ocupado');
    return;
  }
  try {
    const writer = port.writable.getWriter();
    try {
      await writer.write(new Uint8Array([0x05]));
      enqEnviados++;
      // Marca de vida a cada 10 pedidos: se aparecerem [enq] sem nenhuma
      // resposta entre eles, a balanca esta muda (cabo/modo/baud errado).
      if (enqEnviados % 10 === 1) pushRaw(`[enq] pedido de peso #${enqEnviados}`);
    } finally {
      writer.releaseLock();
    }
  } catch (err: any) {
    if (enqFalhas++ % 20 === 0) pushRaw(`[enq] falhou: ${err?.message || err}`);
  }
}

function startEnqPolling(port: any) {
  stopEnqPolling();
  sendEnq(port);
  enqTimer = setInterval(() => {
    if (!keepReading) {
      stopEnqPolling();
      return;
    }
    sendEnq(port);
  }, ENQ_INTERVAL_MS);
}

function stopEnqPolling() {
  if (enqTimer) {
    clearInterval(enqTimer);
    enqTimer = null;
  }
}

async function runReadLoop(port: any) {
  // Guarda contra dois loops simultâneos: cada um cria seu timer de ENQ e os
  // dois passam a escrever na mesma porta, deixando a balança muda.
  if (readLoopRunning) {
    pushRaw('[stream] já existe um leitor ativo — ignorando nova chamada');
    return;
  }
  readLoopRunning = true;
  keepReading = true;

  // Pede o peso periodicamente (balanças sob demanda).
  startEnqPolling(port);

  const decoder = new TextDecoder();
  let buffer = '';

  pushRaw('[stream] iniciado');

  try {
    // Só `keepReading` na condição. Ter `port.readable` aqui fazia o loop SAIR
    // durante a troca de leitor (o stream fica indisponível por um instante),
    // o runReadLoop era chamado de novo e dois timers de ENQ passavam a
    // disputar a mesma porta — a balança recebia comando fora de hora e ficava
    // muda. Se a porta cair de vez, o `if` abaixo encerra.
    while (keepReading) {
      if (!port.readable) {
        // Pode ser a troca de leitor: espera e reavalia antes de desistir.
        await new Promise((r) => setTimeout(r, 200));
        if (!port.readable) break;
      }
      if (port.readable.locked) {
        pushRaw('[stream] porta travada por outro leitor — aguardando');
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      activeReader = port.readable.getReader();
      try {
        while (keepReading) {
          const { value, done } = await activeReader.read();
          if (done) {
            // done = a balanca fechou ESTE stream. NAO significa desconectada.
            // Sair do loop aqui matava a leitura apos o primeiro frame (era o
            // "gerou log uma vez e parou"). Soltamos o reader e pegamos outro.
            pushRaw('[stream] fim de bloco — reabrindo leitor');
            break;
          }
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });

          // Só processa LINHAS FECHADAS. O resto fica no buffer aguardando
          // o restante do frame — é isto que impede o peso truncado.
          const todasAsPartes = buffer.split(/\r\n|\r|\n|\x03/);
          buffer = todasAsPartes.pop() ?? '';

          // A balanca responde a cada ENQ (400 ms) e os frames se acumulam na
          // fila. Processar todos faria a tela exibir peso ATRASADO — foi o que
          // aconteceu com o teste de 246 g: o painel mostrava 00000 antigos
          // enquanto a balanca ja lia 00246. So o ULTIMO frame vale; os demais
          // vao apenas para o log de diagnostico. Ver Regra 6.
          const parts = todasAsPartes.slice(-1);
          for (const antigo of todasAsPartes.slice(0, -1)) {
            if (antigo.trim()) pushRaw(antigo);
          }

          for (const part of parts) {
            if (!part.trim()) continue;
            pushRaw(part);

            const parsed = parseScaleFrame(part);
            if (!parsed.valid) {
              // Frame não reconhecido: fica registrado para diagnóstico,
              // mas o valor é descartado. Nunca aproveitar parcialmente.
              continue;
            }

            // Confirmação por repetição: o peso precisa se repetir N vezes
            // antes de ser considerado confiável para lançar no pedido.
            if (Math.abs(parsed.weightKg - lastWeight) < 0.0005) {
              sameWeightCount++;
            } else {
              sameWeightCount = 1;
              lastWeight = parsed.weightKg;
            }

            const settled = sameWeightCount >= STABLE_CONFIRMATIONS;
            const trustworthy = parsed.isStable && settled;

            emit({
              status: trustworthy ? 'stable' : 'unstable',
              weightKg: parsed.weightKg,
              isStable: trustworthy,
              lastRaw: part.trim(),
              errorMessage: undefined
            });
          }

          // Trava de segurança: buffer que só cresce = frame sem delimitador.
          if (buffer.length > 512) buffer = '';
        }
      } catch (errLeitura: any) {
        // Erro NESTE leitor (nao na porta). Registra e tenta um novo leitor em
        // vez de derrubar o stream inteiro — a balanca costuma se recuperar.
        pushRaw(`[stream] erro de leitura: ${errLeitura?.message || errLeitura}`);
        await new Promise((r) => setTimeout(r, 500));
      } finally {
        try {
          if (activeReader) activeReader.releaseLock();
        } catch (_) {}
        activeReader = null;
      }
    }

    pushRaw(
      keepReading
        ? '[stream] encerrado: a porta deixou de estar legivel'
        : '[stream] encerrado a pedido'
    );
  } catch (err: any) {
    pushRaw(`[stream] FALHOU: ${err?.message || err}`);
    emit({
      status: 'error',
      isStable: false,
      errorMessage: err?.message || 'Falha na leitura da balança'
    });
  } finally {
    stopEnqPolling();
    readLoopRunning = false;
    // O loop terminou. Se ninguém pediu para parar, a porta caiu de verdade:
    // volta para 'disconnected' para a reconexão automática poder agir.
    // Sem isto o status ficava preso em 'waiting' e ninguém tentava de novo.
    if (keepReading) {
      keepReading = false;
      emit({ status: 'disconnected', weightKg: 0, isStable: false });
    }
  }
}

/**
 * Conecta à balança. forcePrompt=true abre o seletor de porta do Chrome/Electron.
 */
/**
 * Trava de concorrencia. Sem ela, a reconexao automatica (5s) dispara enquanto
 * a tentativa anterior ainda esta abrindo a porta, e o Chromium responde
 * "InvalidStateError: A call to open() is already in progress" — varias
 * tentativas competindo pela mesma porta e atrapalhando umas as outras.
 */
let conexaoEmAndamento = false;

export async function connectScale(
  baudRate: number = 9600,
  forcePrompt: boolean = false
): Promise<boolean> {
  if (!isWebSerialSupported()) {
    emit({ status: 'error', errorMessage: 'Web Serial não disponível neste ambiente.' });
    return false;
  }

  // Uma tentativa por vez (ver conexaoEmAndamento acima).
  if (conexaoEmAndamento) return false;
  conexaoEmAndamento = true;

  emit({ status: 'connecting', errorMessage: undefined });

  try {
    let port: any = null;

    if (forcePrompt) {
      await disconnectScalePort();
      port = await (navigator as any).serial.requestPort();
    } else if (activeSerialPort) {
      port = activeSerialPort;
    } else {
      // getPorts() devolve TODAS as portas ja autorizadas. Nesta maquina sao 9,
      // e 8 delas sao Bluetooth que nao abrem. Pegar known[0] as cegas fazia a
      // reconexao automatica falhar com "Failed to open serial port".
      // Por isso tentamos cada uma ate alguma abrir. Ver claude-acai.md, Regra 8.
      const known = await (navigator as any).serial.getPorts();

      // Registra no log de diagnostico o que o navegador enxerga. Aparece no
      // painel "Diagnostico" da tela — o console.log do main.js vai para o
      // terminal, nao para o DevTools, entao nao serve para o operador.
      pushRaw(`[portas autorizadas: ${known ? known.length : 0}]`);
      (known || []).forEach((p: any, i: number) => {
        const info = typeof p.getInfo === 'function' ? p.getInfo() : {};
        const vid = info?.usbVendorId;
        pushRaw(
          `  porta ${i}: ${vid ? 'USB vendorId=' + vid.toString(16) : 'sem VID (provavel Bluetooth)'}`
        );
      });

      if (known && known.length > 0) {
        // Portas com usbVendorId sao USB de verdade (a balanca e uma delas).
        // As Bluetooth nao trazem VID — vao para o fim da fila.
        const ordenadas = [...known].sort((a: any, b: any) => {
          const vidA = typeof a.getInfo === 'function' ? a.getInfo()?.usbVendorId : undefined;
          const vidB = typeof b.getInfo === 'function' ? b.getInfo()?.usbVendorId : undefined;
          return (vidB ? 1 : 0) - (vidA ? 1 : 0);
        });

        for (const candidata of ordenadas) {
          const info = typeof candidata.getInfo === 'function' ? candidata.getInfo() : {};
          const etiqueta = info?.usbVendorId
            ? `USB ${info.usbVendorId.toString(16)}`
            : 'sem VID';

          if (candidata.readable) {          // ja aberta: serve
            pushRaw(`[conexao] ${etiqueta} ja estava aberta — usando`);
            port = candidata;
            break;
          }
          try {
            await candidata.open({ baudRate });
            pushRaw(`[conexao] ${etiqueta} aberta com sucesso (baud ${baudRate})`);
            port = candidata;
            break;
          } catch (err: any) {
            // NUNCA engolir em silencio: sem este log, o diagnostico morre
            // logo depois de listar as portas e nao da para saber o motivo.
            pushRaw(`[conexao] ${etiqueta} NAO abriu: ${err?.name || ''} ${err?.message || err}`);

            // NetworkError na porta da balanca = o SO recusou o acesso.
            // Quase sempre a porta esta OCUPADA por outro programa (software da
            // balanca, emulador de teclado, PDV antigo) ou o driver esta em uso.
            if (err?.name === 'NetworkError' && info?.usbVendorId) {
              pushRaw('[conexao] >>> A porta da balanca existe mas o Windows recusou.');
              pushRaw('[conexao] >>> Causa provavel: OUTRO PROGRAMA esta usando a COM.');
              pushRaw('[conexao] >>> Feche softwares da balanca/PDV antigo e tente de novo.');
            }
          }
        }
      }

      if (!port) {
        // Instalacao NOVA: getPorts() so lista o que ja foi autorizado, entao
        // vem vazio e a balanca nunca apareceria sozinha. No Electron o
        // handler 'select-serial-port' do main.js escolhe a porta SEM mostrar
        // dialogo, entao podemos pedir programaticamente e continuar automatico.
        // (Em navegador comum isto exigiria gesto do usuario e vai falhar —
        // por isso o try/catch silencioso.)
        // ⚠️ NAO chamar requestPort() aqui.
        //
        // requestPort() abre um DIALOGO MODAL NATIVO do Electron, que bloqueia
        // a janela inteira: nenhum campo aceita clique enquanto ele estiver de
        // pe. Como a reconexao automatica roda em intervalo, o dialogo reabria
        // sem parar e travava o PDV todo (busca, checkout, tudo).
        //
        // requestPort() SO pode ser chamado a partir de um clique do usuario —
        // e o que o botao "Conectar USB" faz (forcePrompt = true).
        if (!known || known.length === 0) {
          pushRaw('[conexao] nenhuma porta autorizada — clique em "Conectar USB" uma vez');
        }

        // Nao e erro: fica aguardando o clique em "Conectar USB".
        emit({
          status: 'disconnected',
          weightKg: 0,
          isStable: false,
          errorMessage: undefined
        });
        return false;
      }
    }

    if (!port) {
      emit({ status: 'disconnected', weightKg: 0, isStable: false });
      return false;
    }

    if (!port.readable) {
      try {
        await port.open({ baudRate });
      } catch (openErr: any) {
        if (openErr?.name !== 'InvalidStateError') {
          // A porta escolhida nao abriu (tipicamente uma Bluetooth, que o
          // Electron pode ter entregue no lugar da balanca). Antes de desistir,
          // tenta TODAS as outras portas ja autorizadas. Ver Regra 8.
          let alternativa: any = null;
          try {
            const todas = await (navigator as any).serial.getPorts();
            for (const outra of todas || []) {
              if (outra === port) continue;
              if (outra.readable) {
                alternativa = outra;
                break;
              }
              try {
                await outra.open({ baudRate });
                alternativa = outra;
                break;
              } catch (_) {
                // segue tentando
              }
            }
          } catch (_) {}

          if (alternativa) {
            activeSerialPort = alternativa;
            emit({ status: 'waiting', weightKg: 0, isStable: false, errorMessage: undefined });
            runReadLoop(alternativa);
            return true;
          }

          emit({
            status: 'error',
            errorMessage: `Não foi possível abrir a porta: ${openErr?.message || openErr}`
          });
          return false;
        }
      }
    }

    activeSerialPort = port;
    emit({ status: 'waiting', weightKg: 0, isStable: false, errorMessage: undefined });

    runReadLoop(port);
    return true;
  } catch (err: any) {
    emit({
      status: 'error',
      errorMessage: err?.message || 'Erro ao conectar à balança.'
    });
    return false;
  } finally {
    conexaoEmAndamento = false;
  }
}

/**
 * Compat com a chamada antiga do botão "Conectar USB".
 */
export async function requestSerialPort(baudRate: number = 9600, forcePrompt: boolean = true): Promise<any> {
  const ok = await connectScale(baudRate, forcePrompt);
  if (!ok) throw new Error(snapshot.errorMessage || 'Nenhuma porta serial foi selecionada.');
  return activeSerialPort;
}

/**
 * Leitura pontual, agora servida pelo stream contínuo em vez de reabrir a porta.
 * Mantida para compatibilidade com chamadas existentes.
 */
export async function getScaleWeightWithFallback(
  settings?: {
    isScaleEnabled?: boolean;
    scaleProtocol?: ScaleProtocol;
    scaleBaudRate?: number;
  },
  simulatedWeight?: number
): Promise<ScaleReadResult> {
  if (typeof simulatedWeight === 'number' && simulatedWeight > 0) {
    return {
      weightKg: Number(simulatedWeight.toFixed(3)),
      isStable: true,
      raw: `SIMULATED_${simulatedWeight}kg`
    };
  }

  if (!activeSerialPort && isWebSerialSupported()) {
    await connectScale(settings?.scaleBaudRate || 9600, false);
  }

  return {
    weightKg: snapshot.weightKg,
    isStable: snapshot.isStable,
    raw: snapshot.lastRaw || snapshot.status.toUpperCase()
  };
}

/** Compat: leitura direta de uma porta (usa o snapshot do stream). */
export async function readWeightFromPort(
  _port: any,
  _protocol: ScaleProtocol = 'urano',
  _timeoutMs: number = 1200
): Promise<ScaleReadResult> {
  return {
    weightKg: snapshot.weightKg,
    isStable: snapshot.isStable,
    raw: snapshot.lastRaw || snapshot.status.toUpperCase()
  };
}

export async function disconnectScalePort(): Promise<void> {
  keepReading = false;
  stopEnqPolling();

  if (activeReader) {
    try {
      await activeReader.cancel();
    } catch (_) {}
    activeReader = null;
  }

  if (activeSerialPort) {
    try {
      await activeSerialPort.close();
    } catch (e) {
      console.warn('Erro ao fechar porta serial:', e);
    }
    activeSerialPort = null;
  }

  lastWeight = 0;
  sameWeightCount = 0;
  emit({ status: 'disconnected', weightKg: 0, isStable: false, lastRaw: '' });
}
