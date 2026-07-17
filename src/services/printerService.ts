import { Order, CashSummary } from '../types';

class PrinterService {
  private static processedOrderIds = new Set<string>();
  
  // Cache for performance
  private static cachedPrinterName: string | null = null;
  private static lastPrinterCheck = 0;
  private static readonly PRINTER_CACHE_TTL = 300000; // 5 minutes cache
  
  private hasUnprintedItems(order: Order): boolean {
    return order.items.some(item => !item.printed);
  }

  
  private normalizeText(text: string): string {
    if (!text) return "";
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^\x00-\x7F]/g, "");   // Remove non-ASCII, but KEEP control chars (\x1b, \x1d, etc.)
  }

  private async fetchWithTimeout(url: string, options: any = {}, timeout = 5000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  private checkLocalServer(): Promise<boolean> {
    return this.fetchWithTimeout('http://127.0.0.1:5050/health', { method: 'GET', mode: 'cors' }, 5000)
      .then(res => res.status === 200)
      .catch((err) => {
        console.warn("Printer Server Health Check Failed (Port 5050):", err.message);
        return false;
      });
  }

  generateReceiptHtml(order: Order): string {
    const text = this.generateReceiptText(order);
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page { margin: 0; size: 58mm auto; }
          body { 
            margin: 0; 
            padding: 0; 
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            width: 58mm;
            background: white;
          }
          pre { 
            margin: 0; 
            padding: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.2;
          }
        </style>
      </head>
      <body>
        <pre>${text}</pre>
      </body>
      </html>
    `;
  }

  generateReceiptText(order: Order, settings?: any, itemsOverride?: any[], titleOverride?: string, bottomPadding = 2): string {
    const paperWidth = settings?.printerPaperWidth || '58mm';
    const WIDTH = paperWidth === '80mm' ? 48 : 30; // 30 is safer for all 58mm printers
    const isCompat = settings?.printerCompatibilityMode || false;
    
    // ESC/POS Commands (Standard RAW)
    const RESET = "\x1b\x21\x00"; 
    const BOLD = "\x1b\x21\x08";
    const BIG_BOLD = isCompat ? BOLD : "\x1b\x21\x38";


    const center = (text: string) => {
      // Manual centering by padding spaces to avoid ESC/POS 'ESC a' compatibility issues (e.g. printing 'a' and misalignment)
      // We need to calculate visible length ignoring ESC codes
      const visibleText = text.replace(/\x1b\x21[\x00-\xff]/g, '') // Strip \x1b\x21n (Status/Size)
                              .replace(/\x1b\x61[\x00-\xff]/g, '') // Strip \x1b\x61n (Alignment)
                              .replace(/\x1d\x21[\x00-\xff]/g, ''); // Strip \x1d\x21n (Double height/width)
      
      const padding = Math.max(0, Math.floor((WIDTH - visibleText.length) / 2));
      return " ".repeat(padding) + text;
    };

    const line = () => "-".repeat(WIDTH);
    const doubleLine = () => "=".repeat(WIDTH);

    let content = "";
    
    // Header
    if (titleOverride) {
      content += center(BOLD + `--- ${titleOverride} ---` + RESET) + "\n";
    }
    content += center("PAPALEGUAS LANCHES") + "\n";
    content += line() + "\n";

    // Sequence Number and Type (PROMINENT)
    const seqLabel = order.subOrderIndex !== undefined 
      ? `#${order.dailyOrderNumber}-${order.subOrderIndex}` 
      : `#${order.dailyOrderNumber || '??'}`;

    if (order.orderType === 'Entrega') {
      content += center("ENTREGA") + "\n";
      content += center(BIG_BOLD + `PEDIDO ${seqLabel}` + RESET) + "\n";
    } else if (order.orderType === 'Balcão' && order.table_number) {
      content += center(BIG_BOLD + `MESA ${order.table_number}` + RESET) + "\n";
      content += center(`SEQ: ${seqLabel}`) + "\n";
    } else if (order.orderType === 'Retirada') {
      content += center("RETIRADA") + "\n";
      content += center(BIG_BOLD + `PEDIDO ${seqLabel}` + RESET) + "\n";
      if (order.customerName) {
        content += center(this.normalizeText(order.customerName).toUpperCase()) + "\n";
      }
    } else {
      // General Balcão
      content += center("BALCAO") + "\n";
      content += center(BIG_BOLD + `PEDIDO ${seqLabel}` + RESET) + "\n";
    }

    const orderDate = order.timestamp ? new Date(order.timestamp) : new Date();
    const formattedDate = isNaN(orderDate.getTime()) ? new Date().toLocaleString('pt-BR') : orderDate.toLocaleString('pt-BR');
    content += formattedDate + "\n";
    let originLabel = order.origin ? this.normalizeText(order.origin).toUpperCase() : 'WEB';
    if (originLabel === 'IA') originLabel = 'ROBÔ IA';
    if (originLabel === 'APP') {
        originLabel = order.table_number ? 'GARÇOM' : 'BALCÃO';
    }
    if (order.observation?.toLowerCase().includes('fidelidade') || (order.discount && order.discount > 0)) {
        originLabel = 'FIDELIDADE';
    }
    content += center(BOLD + originLabel + RESET) + "\n";
    content += line() + "\n";

    // CLIENT INFO BOX
    content += BOLD + `CLIENTE: ${this.normalizeText(order.customerName).toUpperCase()}` + RESET + "\n";
    if (order.phone) content += `TEL: ${order.phone}` + "\n";
    
    if (order.address) {
      content += "END: " + this.normalizeText(order.address).toUpperCase() + "\n";
    }
    if (order.referencePoint) {
      content += "REF: " + this.normalizeText(order.referencePoint).toUpperCase() + "\n";
    }

    if (titleOverride === "VIA MOTOBOY" && order.courier_name) {
      content += BOLD + "MOTOBOY: " + this.normalizeText(order.courier_name).toUpperCase() + RESET + "\n";
    }
    
    content += line() + "\n";
    content += "QTD ITEM              VALOR" + "\n";

    const itemsToPrint = itemsOverride || order.items;

    itemsToPrint.forEach(item => {
      const qtyStr = `${item.quantity}x `.padEnd(3);
      let name = this.normalizeText(item.name).toUpperCase();
      if (item.isCombo) name += " (COMBO)";
      const price = ((item.price + (item.isCombo ? (order.comboPrice || 13) : 0)) * item.quantity).toFixed(2);
      
      const maxNameWidth = WIDTH - 12; 
      if (name.length > maxNameWidth) {
        content += qtyStr + name.substring(0, maxNameWidth) + "\n";
        content += " ".repeat(3) + name.substring(maxNameWidth).padEnd(maxNameWidth) + " R$ " + price.padStart(5) + "\n";
      } else {
        content += qtyStr + name.padEnd(maxNameWidth) + " R$ " + price.padStart(5) + "\n";
      }
      
      if (item.isCombo) {
        content += "  + BATATA FRITA DE 200G\n";
        content += "  + REFRI LATA 350ML\n";
      }
      
      if (item.selectedAddons && item.selectedAddons.length > 0) {
        item.selectedAddons.forEach((addon: any) => {
          content += "  + " + this.normalizeText(addon.name).toUpperCase() + "\n";
        });
      }
      
      if (item.notes) {
        content += "  * OBS: " + this.normalizeText(item.notes).toUpperCase() + "\n";
      }
    });

    const subtotal = order.total - (order.deliveryFee || 0);
    content += line() + "\n";
    content += `SUBTOTAL:`.padEnd(WIDTH - 10) + `R$ ${Number(subtotal).toFixed(2).padStart(6)}` + "\n";
    if (order.deliveryFee && Number(order.deliveryFee) > 0) {
      content += BOLD + `TAXA ENTREGA:`.padEnd(WIDTH - 10) + `R$ ${Number(order.deliveryFee).toFixed(2).padStart(6)}` + RESET + "\n";
    }
    content += center(BOLD + `TOTAL : R$ ${Number(order.total).toFixed(2)}` + RESET) + "\n";
    content += doubleLine() + "\n";

    content += `PAGAMENTO: ${this.normalizeText(order.paymentMethod)}` + "\n";
    
    if (order.paymentMethod === 'Dinheiro' && order.changeFor) {
      const tendered = parseFloat(order.changeFor) || 0;
      if (tendered > 0) {
        const change = tendered - order.total;
        content += BOLD + `RECEBER:`.padEnd(WIDTH - 10) + `R$ ${tendered.toFixed(2).padStart(6)}` + RESET + "\n";
        content += BOLD + `TROCO:`.padEnd(WIDTH - 10) + `R$ ${Math.max(0, change).toFixed(2).padStart(6)}` + RESET + "\n";
      }
    }

    if (order.paymentMethod === 'PIX') {
      if (order.orderType === 'Entrega') {
        content += center(BOLD + "QRCODE OU CHAVE PIX") + "\n";
        content += center("GERADA PELO MOTOBOY") + "\n";
        content += center("NA ENTREGA" + RESET) + "\n";
      } else {
        content += center(BOLD + "PAGAMENTO VIA PIX") + "\n";
        content += center("SOLICITE O QRCODE NO BALCAO" + RESET) + "\n";
      }
    }

    if (order.observation) {
      content += BOLD + "OBS: " + this.normalizeText(order.observation).toUpperCase() + RESET + "\n";
    }

    content += line() + "\n";
    content += center(BOLD + "TECX SISTEMAS" + RESET) + "\n";
    content += center("TECXSISTEMAS.APP") + "\n";
    
    // Final Feed (Customizable padding)
    content += "\n".repeat(bottomPadding);

    // Conditional Cut (Only if likely not a mobile printer AND not in compat mode)
    const printerName = settings?.preferredPrinter?.toUpperCase() || "";
    const isMobile = printerName.includes("HPRT") || printerName.includes("MPT") || printerName.includes("MOBILE") || printerName.includes("BT-") || printerName.includes("BLUETOOTH");
    
    if (!isMobile && !isCompat) {
      // Standard Cut command (GS V 66 0) + Legacy ESC i
      content += "\x1d\x56\x42\x00"; 
      content += "\x1b\x69"; 
    }

    return content;
  }

  generateCourierReceiptText(order: Order, settings?: any): string {
    return this.generateReceiptText(order, settings, undefined, "VIA MOTOBOY");
  }

  generateCashReportHtml(summary: CashSummary): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Courier, monospace; width: 58mm; padding: 2mm; }
          pre { font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PAPALEGUAS LANCHES</h1>
          <p>Relatório de Fechamento de Caixa</p>
          <p>${new Date().toLocaleString('pt-BR')}</p>
        </div>

        <div class="row">
          <span>Total de Vendas Esperado:</span>
          <span>R$ ${summary.expected.toFixed(2)}</span>
        </div>
        <div class="row">
          <span>Vendas em Dinheiro:</span>
          <span>R$ ${summary.cashSales.toFixed(2)}</span>
        </div>
        
        <div class="row total">
          <span>SALDO FINAL EM CAIXA:</span>
          <span>R$ ${summary.closingFloat.toFixed(2)}</span>
        </div>
        
        <script>
          window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };
        </script>
      </body>
      </html>
    `;
  }

  async print(order: Order, force = false): Promise<{ success: boolean; message: string }> {
    (order as any).forceFullPrint = force;

    if (!force && order.id && PrinterService.processedOrderIds.has(order.id) && !this.hasUnprintedItems(order)) {
      return { success: true, message: "Já impresso e sem novos itens" };
    }

    try {
      const settings = (order as any).settings;
      const itemsToPrint = (order as any).itemsToPrint || order.items;
      const html = this.generateReceiptHtml({ ...order, items: itemsToPrint });
      
      // 1. Customer Receipt (Primary/Principal)
      const primaryPrinter = settings?.preferredPrinter;
      const skipPrimary = (order as any).skipPrimary || (order.observation && order.observation.includes('[SO_COZINHA]')) || order.origin === 'WAITER_KITCHEN';
      
      if (primaryPrinter && primaryPrinter.trim() !== '' && !skipPrimary) {
          const content = this.generateReceiptText(order, settings, itemsToPrint, "VIA PRINCIPAL", 1);
          console.log(`[Printer] Dispatching PRIMARY/CUSTOMER receipt. Target: ${primaryPrinter}`);
          await this.printSilently(html, content, { ...settings, isPrimary: true });
      } else {
          console.log(`[Printer] PRIMARY/CUSTOMER receipt SKIPPED (${skipPrimary ? 'Requested skip' : 'Deactivated'}).`);
      }

      // 2. Kitchen Receipt (Produção)
      const kitchenPrinter = settings?.kitchenPrinter;
      const isFinalization = order.status === 'Entregue' || order.status === 'Conta Solicitada';
      
      if (kitchenPrinter && kitchenPrinter.trim() !== '' && !isFinalization) {
          console.log(`[Printer] Dispatching KITCHEN receipt. Target: ${kitchenPrinter}`);
          const kitchenContent = this.generateReceiptText(order, settings, itemsToPrint, "VIA COZINHA", 5);
          if (kitchenContent) {
              await this.printSilently(html, kitchenContent, {
                  ...settings,
                  preferredPrinter: kitchenPrinter,
                  printerPaperWidth: settings.kitchenPrinterPaperWidth || '58mm',
                  isPrimary: false
              });
          }
      }

      // 3. Bar Receipt (Bar / Balcão)
      const barPrinter = settings?.barPrinter;
      if (barPrinter && barPrinter.trim() !== '' && !isFinalization) {
          console.log(`[Printer) Dispatching BAR/BALCAO receipt. Target: ${barPrinter}`);
          const barContent = this.generateReceiptText(order, settings, itemsToPrint, "VIA BAR", 5);
          if (barContent) {
              await this.printSilently(html, barContent, {
                  ...settings,
                  preferredPrinter: barPrinter,
                  printerPaperWidth: settings.barPrinterPaperWidth || '58mm',
                  isPrimary: false
              });
          }
      }

      // 4. Courier Receipt (Motoboy)
      const courierPrinter = settings?.courierPrinter;
      if (courierPrinter && courierPrinter.trim() !== '' && order.orderType === 'Entrega') {
          console.log(`[Printer] Dispatching COURIER/MOTOBOY receipt. Target: ${courierPrinter}`);
          const courierContent = this.generateReceiptText(order, settings, itemsToPrint, "VIA MOTOBOY", 5);
          if (courierContent) {
              await this.printSilently(html, courierContent, {
                  ...settings,
                  preferredPrinter: courierPrinter,
                  printerPaperWidth: settings.courierPrinterPaperWidth || '58mm',
                  isPrimary: false
              });
          }
      }

      if (order.id) {
        PrinterService.processedOrderIds.add(order.id);
        setTimeout(() => PrinterService.processedOrderIds.delete(order.id!), 60000);
      }
      return { success: true, message: "Enviado para impressão" };
    } catch (e: any) {
      console.error(e);
      return { success: false, message: "Erro ao imprimir: " + e.message };
    }
  }

  async printCashReport(summary: CashSummary): Promise<{ success: boolean; message: string }> {
    try {
      const html = this.generateCashReportHtml(summary);
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        return { success: true, message: "Relatório enviado para impressão" };
      } else {
        throw new Error("Bloqueador de pop-ups impediu a impressão.");
      }
    } catch (e: any) {
      console.error(e);
      return { success: false, message: "Erro ao imprimir: " + e.message };
    }
  }

  private static printQueue: { html: string; content: string; resolve: () => void; reject: (err: any) => void; settings?: any; isPrimary: boolean }[] = [];
  private static processingQueue = false;

  private async printSilently(html: string, content: string, settings?: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const isPrimary = settings?.isPrimary || false;
      PrinterService.printQueue.push({ html, content, resolve, reject, settings, isPrimary });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (PrinterService.processingQueue || PrinterService.printQueue.length === 0) return;
    PrinterService.processingQueue = true;

    while (PrinterService.printQueue.length > 0) {
      const job = PrinterService.printQueue.shift();
      if (!job) continue;

      let attempts = 0;
      const maxAttempts = 2;
      let success = false;

      while (attempts < maxAttempts && !success) {
        try {
          let selectedPrinter = PrinterService.cachedPrinterName;
          const now = Date.now();
          const cacheExpired = (now - PrinterService.lastPrinterCheck) > PrinterService.PRINTER_CACHE_TTL;
          const forceRefresh = job.settings?.preferredPrinter && job.settings.preferredPrinter !== selectedPrinter;

          if (!selectedPrinter || cacheExpired || forceRefresh) {
              const isOnline = await this.checkLocalServer();
              if (!isOnline) throw new Error("Servidor de impressão offline.");

              const printerRes = await this.fetchWithTimeout('http://127.0.0.1:5050/printers', { method: 'GET' }, 10000);
              const printerList = await printerRes.json();
              
              const preferred = job.settings?.preferredPrinter;
              if (preferred && preferred.trim() !== '') {
                  const found = printerList.find((p: any) => p.Name.toUpperCase() === preferred.toUpperCase());
                  if (found) selectedPrinter = found.Name;
              }
              
              if (!selectedPrinter && job.isPrimary) {
                  const defaultPrinter = printerList.find((p: any) => p.IsDefault);
                  selectedPrinter = defaultPrinter ? defaultPrinter.Name : printerList[0]?.Name || "";
              }
              
              if (selectedPrinter) {
                  PrinterService.cachedPrinterName = selectedPrinter;
                  PrinterService.lastPrinterCheck = now;
              }
          }

          if (!selectedPrinter) throw new Error("Nenhuma impressora encontrada.");

          const rawContent = '\x1b\x40' + job.content + '\n\n\n';
          await this.fetchWithTimeout('http://127.0.0.1:5050/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: rawContent, printer_name: selectedPrinter })
          }, 30000);

          job.resolve();
          success = true;
        } catch (err: any) {
          attempts++;
          if (attempts >= maxAttempts) job.reject(err);
          else await new Promise(r => setTimeout(r, 1000));
        }
      }
      await new Promise(r => setTimeout(r, 800));
    }
    PrinterService.processingQueue = false;
  }
}

export const printerService = new PrinterService();
export const printOrder = (order: Order, force = false) => printerService.print(order, force);
export const printCashReport = (summary: CashSummary) => printerService.printCashReport(summary);
export const generateReceiptText = (order: Order, settings?: any, itemsOverride?: any[], titleOverride?: string, bottomPadding?: number) => printerService.generateReceiptText(order, settings, itemsOverride, titleOverride, bottomPadding);