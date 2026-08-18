export interface ScaleReadResult {
  weightKg: number;
  isStable: boolean;
  raw: string;
  error?: string;
}

export type ScaleProtocol = 'urano' | 'toledo' | 'filizola' | 'elgin' | 'generic';

let activeSerialPort: any = null;
let activeReader: any = null;

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Parser de Strings para Balanças Urano
 * Formatos comuns Urano:
 * - "ST,GS, 0.450kg" -> 0.450
 * - "\x0200450\x03" ou "\x02 0.450\x03" -> 0.450
 * - "0.450" ou "0,450" -> 0.450
 */
export function parseUranoWeight(data: string): number {
  if (!data) return 0;
  
  // Limpar caracteres nulos e quebras de linha
  const cleanStr = data.replace(/[\r\n\x02\x03]/g, '').trim();

  // Tentar encontrar número com ponto ou vírgula no padrão '0.450' ou '1.250'
  const matchDecimal = cleanStr.match(/(\d{1,3}[\.,]\d{2,3})/);
  if (matchDecimal) {
    const val = parseFloat(matchDecimal[1].replace(',', '.'));
    if (!isNaN(val) && val >= 0) return val;
  }

  // Caso seja string só de dígitos sem ponto decimal (ex: "00450" para 450g)
  const matchDigits = cleanStr.match(/(\d{4,6})/);
  if (matchDigits) {
    const num = parseInt(matchDigits[1], 10);
    if (!isNaN(num)) return num / 1000;
  }

  return 0;
}

/**
 * Parser para Toledo PRT 1 / Filizola
 */
export function parseToledoWeight(data: string): number {
  return parseUranoWeight(data);
}

/**
 * Parser Universal por Protocolo
 */
export function parseScaleWeight(rawData: string, protocol: ScaleProtocol = 'urano'): ScaleReadResult {
  try {
    let weight = 0;
    switch (protocol) {
      case 'urano':
        weight = parseUranoWeight(rawData);
        break;
      case 'toledo':
      case 'filizola':
      case 'elgin':
      case 'generic':
      default:
        weight = parseUranoWeight(rawData);
        break;
    }

    const isStable = !rawData.toLowerCase().includes('us') && weight > 0;

    return {
      weightKg: Number(weight.toFixed(3)),
      isStable,
      raw: rawData
    };
  } catch (err: any) {
    return {
      weightKg: 0,
      isStable: false,
      raw: rawData,
      error: err?.message || 'Erro ao processar dados da balança'
    };
  }
}

/**
 * Solicita ao usuário para selecionar a porta Serial da Balança (USB/COM)
 */
export async function requestSerialPort(baudRate: number = 9600): Promise<any> {
  if (!isWebSerialSupported()) {
    throw new Error('Web Serial API não é suportada neste navegador ou ambiente.');
  }

  try {
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate });
    activeSerialPort = port;
    return port;
  } catch (err: any) {
    console.error('Erro ao conectar porta serial:', err);
    throw err;
  }
}

/**
 * Lê o peso atual enviando comando ENQ ou lendo stream contínuo da balança
 */
export async function readWeightFromPort(
  port: any,
  protocol: ScaleProtocol = 'urano',
  timeoutMs: number = 2000
): Promise<ScaleReadResult> {
  if (!port || !port.readable) {
    throw new Error('Porta serial não está aberta ou legível.');
  }

  return new Promise(async (resolve, reject) => {
    let timeoutId: any = null;
    let accumulatedText = '';

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      if (accumulatedText) {
        resolve(parseScaleWeight(accumulatedText, protocol));
      } else {
        reject(new Error('Tempo limite esgotado sem resposta da balança.'));
      }
    }, timeoutMs);

    try {
      // Se a porta necessitar de um sinal de requisição (ex: ENQ \x05 para Urano/Toledo)
      if (port.writable) {
        const writer = port.writable.getWriter();
        // Envia byte 0x05 (ENQ) ou 'P'
        const enq = new Uint8Array([0x05]);
        await writer.write(enq);
        writer.releaseLock();
      }

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          accumulatedText += value;
          const parsed = parseScaleWeight(accumulatedText, protocol);
          if (parsed.weightKg > 0) {
            reader.cancel();
            cleanup();
            resolve(parsed);
            return;
          }
        }
      }
    } catch (err) {
      cleanup();
      // Tentar ler os dados acumulados caso tenha recebido algo antes do fechamento
      if (accumulatedText) {
        resolve(parseScaleWeight(accumulatedText, protocol));
      } else {
        reject(err);
      }
    }
  });
}

/**
 * Leitura com fallback simulado para testes quando não houver balança conectada
 */
export async function getScaleWeightWithFallback(
  settings?: {
    isScaleEnabled?: boolean;
    scaleProtocol?: ScaleProtocol;
    scaleBaudRate?: number;
  },
  simulatedWeight?: number
): Promise<ScaleReadResult> {
  const protocol = settings?.scaleProtocol || 'urano';
  const baudRate = settings?.scaleBaudRate || 9600;

  // Se houver porta ativa conectada via Web Serial
  if (activeSerialPort && activeSerialPort.readable) {
    try {
      return await readWeightFromPort(activeSerialPort, protocol, 2500);
    } catch (e) {
      console.warn('Falha na leitura direta da porta ativa. Tentando reconexão...', e);
    }
  }

  // Se suportar Web Serial e tiver permissão prévia de porta já autorizada
  if (isWebSerialSupported()) {
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports && ports.length > 0) {
        const port = ports[0];
        if (!port.open) {
          await port.open({ baudRate });
        }
        activeSerialPort = port;
        return await readWeightFromPort(port, protocol, 2500);
      }
    } catch (err) {
      console.warn('Aviso ao consultar portas seriais gravadas:', err);
    }
  }

  // Fallback para simulação (se fornecido peso simulado ou manual)
  if (typeof simulatedWeight === 'number' && simulatedWeight > 0) {
    return {
      weightKg: Number(simulatedWeight.toFixed(3)),
      isStable: true,
      raw: `SIMULATED_${simulatedWeight}kg`
    };
  }

  throw new Error('Nenhuma balança serial conectada. Por favor, conecte a balança Urano via USB/COM ou selecione a porta serial.');
}

/**
 * Fecha a porta serial ativa
 */
export async function disconnectScalePort(): Promise<void> {
  if (activeSerialPort) {
    try {
      if (activeReader) {
        await activeReader.cancel();
      }
      await activeSerialPort.close();
    } catch (e) {
      console.warn('Erro ao fechar porta serial:', e);
    } finally {
      activeSerialPort = null;
      activeReader = null;
    }
  }
}
