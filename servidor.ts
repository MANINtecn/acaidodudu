import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

process.on('uncaughtException', (err) => {
    console.error(`\n[CRÍTICO] Erro não tratado: ${err}`);
    if (process.send) process.send({ type: 'whatsapp-status', data: { connection: 'error', reason: err.message } });
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error(`\n[CRÍTICO] Rejeição não tratada: ${reason}`);
    if (process.send) process.send({ type: 'whatsapp-status', data: { connection: 'error', reason: String(reason) } });
    process.exit(1);
});

// --- CONFIGURATION ---
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const STORE_ID = process.env.STORE_ID || '';

const BTZAP_TOKEN = process.env.BTZAP_TOKEN || '';
const PHONE_ID = process.env.PHONE_ID || 'acaidodudu';
const PORT = process.env.PORT || 3000;

let INSTANCE_NUMBER = process.env.INSTANCE_NUMBER || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    console.error('CRITICAL ERROR: Environment variables missing.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

let IS_BOT_ENABLED = process.env.IS_BOT_ENABLED === 'true';
let BYPASS_NUMBER = process.env.BYPASS_NUMBER || '';

// CACHE DE IDs PARA EVITAR AUTO-PAUSA
const sentByBotIds = new Set<string>();
setInterval(() => sentByBotIds.clear(), 600000); 

process.on('message', (m: any) => {
    if (m.type === 'config-update') {
        IS_BOT_ENABLED = m.config.isBotEnabled;
        BYPASS_NUMBER = m.config.bypassNumber;
        if (m.config.instanceNumber) INSTANCE_NUMBER = m.config.instanceNumber;
    } else if (m.type === 'send-message') {
        sendBtzapMessage(m.data.phone, m.data.message);
    }
});

function customLog(msg: any) {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
    console.log(text);
    if (process.send) {
        process.send({ type: 'bot-log', data: text });
    }
}

// --- DYNAMIC SYSTEM PROMPT ---
function getSystemPrompt() {
    const userPrompt = process.env.BOT_PROMPT || `Você é o Papaléguas Mascote, atendente da "Papaléguas Lanches". 🏃‍♂️💨🍔🍟`;
    
    // REGRAS DE OURO (Sempre injetadas para garantir estabilidade)
    const CORE_RULES = `
### REGRAS DE OURO (MUITO IMPORTANTE):
1. **ZERO AUTONOMIA**: Você é um anotador de pedidos. Você NÃO TEM PODER para dar descontos, criar promoções, alterar preços ou inventar produtos. Se não está no {{CARDAPIO}}, não existe.
2. **FIDELIDADE AO PREÇO**: O preço de cada item DEVE ser o que consta no {{CARDAPIO}}. Você é PROIBIDO de dizer que algo é grátis ou cortesia.
3. **SAUDAÇÃO PERSONALIZADA**: Se o campo 'name' em {{CADASTRO}} existir, comece com "Olá [Nome]! Que bom ter você de volta!". Se 'address' existir, CONFIRME-O proativamente.
4. **MAPEAMENTO NINJA**: Use EXATAMENTE os nomes do {{CARDAPIO}}. NUNCA escolha "Combo" se o cliente pediu individual.
5. **FECHAMENTO COM CONFIRMAÇÃO**: Quando tiver todos os dados, pergunte: "Posso finalizar seu pedido agora?". Use a ferramenta 'create_order' APENAS após o "Sim" do cliente.
6. **CÁLCULO DE VALOR**: O campo 'total' DEVE ser a soma exata dos itens (SUBTOTAL). NÃO inclua a taxa de entrega no 'total'.

### REGRAS DE PIX E COMPROVANTES:
6. **CHAVE PIX**: Se o cliente pedir a chave, informe: "A chave Pix será gerada na hora pelo motoboy para sua segurança! 🛵💨".
7. **VERIFICAÇÃO DE COMPROVANTE**: Se o cliente enviar uma imagem de comprovante, verifique:
   - Nome do Favorecido: Manoel soares de Souza Lima (Verifique se coincide).
   - Chave Pix/CPF: 06406305612.
   - Valor: Deve ser igual ao total do pedido.
   - Data: Deve ser de hoje e não ser agendamento.
   - Se estiver OK, confirme o recebimento de forma natural. Se for inválido ou de outro valor, negue e chame um atendente humano usando 'set_customer_ignore'.

### REGRAS DE TAXA DE ENTREGA:
8. **VALIDAÇÃO DE TAXA (OBRIGATÓRIO)**: 
   - Se o campo 'Taxa de Entrega Sugerida' na seção contexto contiver um valor confirmado, você **DEVE** usar esse valor no pedido.
   - Se o cliente informar um NOVO endereço, use a ferramenta 'check_delivery_fee' para validar a taxa antes de confirmar.
   - Só use as regras abaixo se a ferramenta ou a sugestão falharem:
     * Roça, Rural, BR: R$ 6.00
     * Vale do Ouro/Boates: R$ 4.00
     * Colônia, Padre Damião: R$ 7.00
     * Centro/Outros Bairros: R$ 2.00

### REGRAS DE TROCO:
9. **CÁLCULO DE TROCO**: Se o cliente pedir troco (ex: "para 50"), preencha o campo 'changeFor' com '50'. O sistema calculará o valor que deve ser devolvido automaticamente. **Se o pagamento for em Dinheiro e o cliente NÃO especificar o troco, você DEVE perguntar: "Vai precisar de troco para quanto?" antes de oferecer para finalizar o pedido.**
`;
    return `
${userPrompt}

${CORE_RULES}

### INCENTIVO AO APP:
10. **LINK DO APP**: Sempre que apropriado (no início ou final), incentive o uso do nosso Site/App e o Selo de Fidelidade: https://papaleguastocmg.vercel.app/

### TRAVA DE SEGURANÇA CONTRA PREJUÍZO (CRÍTICO):
11. **PROIBIÇÃO DE BRINDES**: Você é terminantemente PROIBIDO de oferecer qualquer item, refil, bebida ou acompanhamento de forma gratuita. 
12. **VERIFICAÇÃO DE PREÇO**: Todo item solicitado pelo cliente DEVE ser buscado no {{CARDAPIO}}. Se o cliente pedir algo que você não encontrar o preço, você deve dizer: "Vou verificar o valor desse item para você, um minuto" e NÃO deve finalizar o pedido com valor R$ 0,00 para esse item.
13. **NUNCA invente promoções**. Se não está no bloco {{CARDAPIO}} ou {{LEARNINGS}}, o item tem o preço tabelado.

### APRENDIZADOS E INSTRUÇÕES RECENTES:
Este bloco contém orientações que você aprendeu com o Gerente. Siga-as rigorosamente:
{{LEARNINGS}}

### DADOS DO CLIENTE NO SISTEMA (REGRAS DE OURO):
{{CADASTRO}}

### CONTEXTO DE ATENDIMENTO:
- Pedido Ativo: {{PEDIDO_ATIVO}} | ID: {{ID_PEDIDO}} | Status: {{STATUS_PEDIDO}}
- Detalhes do Pedido Ativo: {{DETALHES_PEDIDO}}
- Telefone do Cliente: "{{TELEFONE}}"
- Taxa de Entrega Sugerida: {{TAXA_SUGERIDA}}
- Cardápio Atual: {{CARDAPIO}}
`.trim();
}

// --- UTILITÁRIOS ---

async function downloadMedia(msgId: string, baseUrl: string) {
    try {
        const urlCombined = `${baseUrl}/message/download`.replace('//message', '/message');
        customLog(`[Portal] Descriptografando áudio via API BTZap...`);
        const res = await axios.post(urlCombined, { 
            id: msgId, 
            return_base64: true,
            generate_mp3: false
        }, { headers: { 'token': BTZAP_TOKEN }, timeout: 15000 });

        const base64 = res.data?.base64 || res.data?.data?.base64 || res.data?.base64Data || res.data?.data || res.data?.result || res.data?.content || (typeof res.data === 'string' && res.data.length > 100 ? res.data : null);
        
        if (!base64) {
            customLog(`[Portal] ❌ Falha na extração de Base64. Keys no payload: ${Object.keys(res.data || {}).join(', ')}`);
            throw new Error("Base64 não retornado pela API de download.");
        }

        return base64;
    } catch (e: any) {
        customLog(`[Portal] ❌ Erro no download: ${e.response?.data?.message || e.message}`);
        return null;
    }
}

async function transcribeAudio(audioData: { url?: string, id?: string, baseUrl?: string, base64?: string }) {
    try {
        let buffer: Buffer;
        
        // Se a URL for criptografada (.enc) e tivermos o msgId, tentamos baixar via API.
        if (audioData.url?.includes('.enc') && audioData.id && audioData.baseUrl) {
            const downloadedBase64 = await downloadMedia(audioData.id, audioData.baseUrl);
            if (downloadedBase64) {
                buffer = Buffer.from(downloadedBase64, 'base64');
            } else return null;
        } 
        else if (audioData.base64) {
            buffer = Buffer.from(audioData.base64, 'base64');
        } else if (audioData.url) {
            const res = await axios.get(audioData.url, { responseType: 'arraybuffer' });
            buffer = Buffer.from(res.data);
        } else return null;

        if (!buffer || buffer.length < 100) {
            customLog(`[Áudio] ❌ Buffer inválido ou muito pequeno (${buffer?.length || 0} bytes).`);
            return null;
        }

        customLog(`[Áudio] Transcrevendo ${buffer.length} bytes com Whisper...`);
        const tr = await openai.audio.transcriptions.create({ 
            file: await OpenAI.toFile(buffer, 'audio.mp3'), // Whisper handles mp3/ogg/etc. mp3 is generic.
            model: "whisper-1" 
        });
        return tr.text;
    } catch (err: any) { 
        customLog(`[Áudio] ❌ Erro na transcrição: ${err.message}`); 
        return null; 
    }

}

const processedIds = new Set<string>();
setInterval(() => processedIds.clear(), 300000);

async function getSuggestedFee(address: string): Promise<number | null> {
    try {
        if (!address || address.length < 3) return null;
        const { data, error } = await supabase.rpc('get_delivery_fee_by_address', { p_address: address });
        if (error) {
            customLog(`[Taxa] Erro ao buscar taxa: ${error.message}`);
            return null;
        }
        return data as number;
    } catch (e) {
        return null;
    }
}

function extractMessageText(msg: any): string {
    if (!msg) return "";
    let quoted = "";
    const ctx = msg.contextInfo || msg.data?.message?.contextInfo;
    if (ctx?.quotedMessage) {
        const qm = ctx.quotedMessage;
        const qText = qm.conversation || qm.extendedTextMessage?.text || qm.imageMessage?.caption || "[Mídia]";
        quoted = `(Citação: "${qText}") `;
    }

    let text = msg.text || msg.conversation || msg.extendedTextMessage?.text || 
               msg.content?.text || msg.content?.conversation || msg.body || "";

    if (!text) {
        if (msg.imageMessage || msg.content?.imageMessage) text = "[Imagem]";
        else if (msg.stickerMessage || msg.content?.stickerMessage) text = "[Figurinha]";
        else if (msg.videoMessage || msg.content?.videoMessage) text = "[Vídeo]";
    }
    return (quoted + String(text)).trim();
}

async function sendBTZAPPresence(num: string, type: 'composing' | 'recording' | 'paused') {
    try {
        const clean = num.replace(/\D/g, '');
        let finalNum = clean;
        if (clean.length <= 11 && !clean.startsWith('55')) finalNum = '55' + clean;

        // Evolution API v2 Pattern (BTZap)
        // BTZap Docs: POST https://server.btzap.com.br/message/presence
        await axios.post(`https://server.btzap.com.br/message/presence`, { 
            number: finalNum, 
            presence: type === 'typing' ? 'composing' : (type === 'recording' ? 'recording' : 'composing'),
            delay: 1200
        }, { headers: { 'token': BTZAP_TOKEN }, timeout: 5000 });
    } catch (e: any) { 
        // Silently fail presence
        console.error(`[Presence Fix] Failed to update presence for ${num}:`, e.message);
    }
}

async function sendBTZAPMessage(num: string, text: string) {
    try {
        const clean = num.replace(/\D/g, '');
        let finalNum = clean;
        if (clean.length <= 11 && !clean.startsWith('55')) finalNum = '55' + clean;

        // BTZap Docs: POST https://server.btzap.com.br/send/text
        const res = await axios.post(`https://server.btzap.com.br/send/text`, { 
            number: finalNum, 
            text 
        }, { headers: { 'token': BTZAP_TOKEN }, timeout: 20000 });

        const sentId = res.data?.key?.id || res.data?.messageId;
        if (sentId) {
            sentByBotIds.add(sentId);
        }
    } catch (e: any) { 
        customLog(`[BTZAP] ❌ Erro: ${e.response?.data?.message || e.message}`); 
    }
}

const messageBuffers = new Map<string, { messages: string[], media: any[], timer: NodeJS.Timeout }>();

async function processBuffer(phone: string, pushName: string) {
    const buffer = messageBuffers.get(phone);
    if (!buffer) return;
    messageBuffers.delete(phone);

    const combined = buffer.messages.join(' \n ');
    const lastImage = [...buffer.media].reverse().find(m => m.type === 'image');
    
    const isBypass = BYPASS_NUMBER && phone.endsWith(BYPASS_NUMBER.replace(/\D/g, '').slice(-8));

    if (!IS_BOT_ENABLED && !isBypass) return;

    try {
        customLog(`\n[Processando] (${phone}): ${combined}`);
        await sendBTZAPPresence(phone, 'composing');
        const historySince = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const [isPaused, menuRes, customerRes, activeOrderRes, histRes, learningsRes] = await Promise.all([
            supabase.rpc('is_ai_paused', { p_phone: phone }),
            supabase.rpc('get_menu_for_ai', { p_store_id: STORE_ID }),
            supabase.rpc('get_customer_for_ai', { p_store_id: STORE_ID, p_phone: phone }),
            supabase.rpc('get_active_order_for_ai', { p_store_id: STORE_ID, p_phone: phone }),
            supabase.from('chat_histories')
                .select('role, content, message')
                .eq('session_id', `${phone}-v1`)
                .gte('created_at', historySince)
                .order('created_at', { ascending: false })
                .limit(50),

            supabase.rpc('get_bot_learnings', { p_store_id: STORE_ID })
        ]);

        const learnings = learningsRes.data ? learningsRes.data.map((l: any) => `- ${l.instruction}`).join('\n') : "Nenhum aprendizado novo.";

        if (isPaused.data) { customLog(`[Pausa] Robô silenciado via banco.`); return; }

        const customer = customerRes.data || { status: 'novo' };
        
        // Se o cliente for novo ou não tiver nome, usa o nome do perfil do WhatsApp
        if (!customer.name && pushName && pushName !== 'Cliente') {
            customer.name = pushName;
            customer.aviso_ia = "Este nome veio do perfil do WhatsApp. Confirme com o cliente se o endereço de entrega será o mesmo.";
        }

        // Busca proativa de taxa baseada no endereço do cadastro
        let suggestedFee: number | null = null;
        if (customer.address) {
            suggestedFee = await getSuggestedFee(customer.address);
            if (suggestedFee !== null) {
                customLog(`[Taxa] Sugestão automática para o cliente: R$ ${suggestedFee}`);
            }
        }

        if (customer.status === 'cadastrado') {
            customLog(`[BANCO] Cliente reconhecido: ${customer.name || 'SEM NOME'} (${phone})`);
            customLog(`[BANCO] Dados: ${JSON.stringify(customer)}`);
        } else {
            customLog(`[BANCO] Cliente não encontrado (status: novo) para o telefone ${phone} na loja ${STORE_ID}`);
        }
        if (histRes.error) customLog(`[Histórico] ❌ Erro Supabase: ${histRes.error.message}`);
        
        const historyData = histRes.data || [];
        const formattedHistory = historyData.reverse().map(log => {
            let msgData = log.message || {};
            
            // Suporte para JSON em formato de texto (comum após migrações)
            if (typeof msgData === 'string') {
                try { msgData = JSON.parse(msgData); } catch (e) { msgData = {}; }
            }
            
            // Prioridade: Colunas da tabela -> Campos do objeto JSON
            const role = log.role || msgData.type || msgData.role;
            const content = log.content || msgData.content;
            
            let openAiRole = "user";
            if (role === "ai" || role === "assistant" || role === "admin") openAiRole = "assistant";
            
            return { role: openAiRole, content: String(content || "").trim() };
        }).filter(m => m.content && m.content.length > 0);

        customLog(`[Memória] ${formattedHistory.length} mensagens recuperadas para ${phone}.`);



        const activeOrderData = activeOrderRes.data || { hasActiveOrder: false };
        const menuData = typeof menuRes.data === 'string' ? menuRes.data : JSON.stringify(menuRes.data || '[]');
        const customerData = JSON.stringify(customer);

        let prompt = getSystemPrompt()
            .replace(/{{PEDIDO_ATIVO}}/, (activeOrderData.hasActiveOrder) ? 'SIM' : 'NÃO')
            .replace(/{{ID_PEDIDO}}/, String(activeOrderData.displayId || 'N/A'))
            .replace(/{{STATUS_PEDIDO}}/, String(activeOrderData.status || 'Nenhum'))
            .replace(/{{DETALHES_PEDIDO}}/, activeOrderData.items ? JSON.stringify(activeOrderData.items) : 'Nenhum')
            .replace(/{{LEARNINGS}}/, learnings)
            .replace(/{{TELEFONE}}/, phone)
            .replace(/{{CADASTRO}}/, customerData)
            .replace(/{{TAXA_SUGERIDA}}/, suggestedFee !== null ? `R$ ${suggestedFee.toFixed(2)} (CONFIRMADA PELO SISTEMA)` : "Não identificada. Use as regras de região.")
            .replace(/{{CARDAPIO}}/, menuData);

        // REGRA ESTRITA: Se for a primeira mensagem, forçar o link do app!
        if (formattedHistory.length === 0) {
            prompt += `\n\n### REGRA DA PRIMEIRA MENSAGEM (CRÍTICO):
Esta é a PRIMEIRA mensagem do cliente. Você é OBRIGADO a incluir o link do nosso App (https://papaleguastocmg.vercel.app/) na sua resposta inicial, convidando-o a fazer o pedido ou participar do Selo de Fidelidade por lá.`;
        }

        const messages: any[] = [{ role: 'system', content: prompt }];
        
        // Adiciona histórico formatado
        messages.push(...formattedHistory);

        // Se houver uma imagem no buffer, envia para análise (Vision)
        if (lastImage && lastImage.id) {
            const base64 = await downloadMedia(lastImage.id, lastImage.baseUrl);
            if (base64) {
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: combined || "Analise esta imagem junto com o pedido." },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
                    ]
                });
            } else {
                messages.push({ role: 'user', content: combined });
            }
        } else {
            messages.push({ role: 'user', content: combined });
        }

        await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'human', p_content: combined });

        const tools: any[] = [
            { type: "function", function: { name: "create_order", parameters: { type: "object", properties: { customer: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, reference: { type: "string" } }, required: ["name", "phone", "address"] }, order: { type: "object", properties: { type: { type: "string", enum: ["Entrega", "Retirada"] }, paymentMethod: { type: "string", enum: ["Dinheiro", "Cartão", "Pix"] }, changeFor: { type: "string" }, deliveryFee: { type: "number", description: "Taxa: 2.00 (Cidade), 4.00 (Boates/Vale Ouro), 6.00 (Roça/Rural/BR), 7.00 (Colônia/Padre Damião). USE A TAXA SUGERIDA SE DISPONÍVEL." }, total: { type: "number", description: "SOMA DOS ITENS (SEM TAXA). O sistema somará a taxa." } }, required: ["type", "paymentMethod", "total", "deliveryFee"] }, items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" }, price: { type: "number" }, notes: { type: "string" } }, required: ["name", "quantity", "price"] } } }, required: ["customer", "order", "items"] } } },
            { type: "function", function: { name: "check_delivery_fee", parameters: { type: "object", properties: { address: { type: "string", description: "O endereço completo ou bairro para verificar a taxa." } }, required: ["address"] } } },
            { type: "function", function: { name: "cancel_active_orders", parameters: { type: "object", properties: {} } } },
            { type: "function", function: { name: "set_customer_ignore", parameters: { type: "object", properties: { minutes: { type: "number" } } } } },
            { type: "function", function: { name: "save_bot_learning", parameters: { type: "object", properties: { instruction: { type: "string", description: "A nova regra ou correção aprendida. Seja conciso e claro." } }, required: ["instruction"] } } }
        ];

        const response = await openai.chat.completions.create({ model: "gpt-4o-mini", messages, tools, tool_choice: "auto", temperature: 0.2 });
        const aiMsg = response.choices[0].message;

        if (aiMsg.tool_calls) {
            let hasCreatedOrder = false;
            for (const call of (aiMsg.tool_calls as any[])) {
                let args: any = {}; try { args = JSON.parse(call.function.arguments); } catch(e){}
                if (call.function.name === 'create_order') {
                    if (hasCreatedOrder) {
                        customLog(`[AÇÃO] Ignorando chamada duplicada de create_order no mesmo turno.`);
                        continue;
                    }
                    hasCreatedOrder = true;
                    customLog(`[AÇÃO] Chamando ferramenta: criar_pedido para ${args.customer?.name} (${phone})`);
                    
                    // TRAVA DE SEGURANÇA: Validar se existem itens com preço 0 que não deveriam
                    const hasUnauthorizedFreeItems = args.items.some((item: any) => 
                        (item.price === 0 || !item.price) && !item.name.toLowerCase().includes('fidelidade')
                    );

                    if (hasUnauthorizedFreeItems) {
                        customLog(`[BLOQUEIO] 🛑 Tentativa de criar pedido com item grátis não autorizado.`);
                        await sendBTZAPMessage(phone, "Ops! Notei um erro no valor de um dos itens. Vou chamar um atendente para confirmar os preços para você e já te respondemos! 🙋‍♂️");
                        await supabase.rpc('set_ai_pause', { p_phone: phone, p_seconds: 1800 });
                        return;
                    }

                    const res = await supabase.rpc('create_order_via_bot', { p_store_id: STORE_ID, p_customer: args.customer, p_order: args.order, p_items: args.items });
                    
                    if (res.error) {
                        customLog(`[ERRO BANCO] ❌ Falha no RPC: ${res.error.message}`);
                    } else if (res.data?.success) {
                        const orderNum = res.data.dailyOrderNumber || 'OK';
                        const reply = `Confirmado! Pedido #${orderNum} já está na cozinha. 🛵🍟 Só aguardar!`;
                        await sendBTZAPMessage(phone, reply);
                        await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'ai', p_content: reply });
                        customLog(`[SUCESSO] Pedido #${orderNum} registrado.`);
                    } else {
                        const errorMsg = res.data?.error || 'Erro desconhecido';
                        customLog(`[ERRO LÓGICA] ❌ Banco recusou o pedido: ${errorMsg}`);
                        if (errorMsg.includes('Duplicidade')) {
                            await sendBTZAPMessage(phone, "Ops! Notei que você já tem um pedido idêntico enviado agora mesmo. Pode ficar tranquilo que ele já está na cozinha! 🍔✅");
                        } else {
                            await sendBTZAPMessage(phone, "Houve um pequeno erro ao processar seu pedido no sistema. Pode repetir os itens para confirmarmos?");
                        }
                    }
                } else if (call.function.name === 'check_delivery_fee') {
                    const fee = await getSuggestedFee(args.address);
                    const result = fee !== null ? `A taxa para "${args.address}" é R$ ${fee.toFixed(2)}.` : "Bairro não encontrado no mapeamento oficial. Use as regras gerais.";
                    messages.push({ role: 'assistant', tool_calls: [call], content: null });
                    messages.push({ role: 'tool', tool_call_id: call.id, name: 'check_delivery_fee', content: result });
                    
                    // Segunda chamada para gerar a resposta final
                    const secondResponse = await openai.chat.completions.create({ model: "gpt-4o-mini", messages, temperature: 0.2 });
                    const reply = secondResponse.choices[0].message.content || "";
                    if (reply) {
                        await sendBTZAPMessage(phone, reply);
                        await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'ai', p_content: reply });
                    }
                } else if (call.function.name === 'cancel_active_orders') {
                    await supabase.rpc('cancel_active_orders_via_bot', { p_phone: phone, p_store_id: STORE_ID });
                    await sendBTZAPMessage(phone, "Ok, pedido cancelado! Quer pedir outra coisa?");
                } else if (call.function.name === 'set_customer_ignore') {
                    await supabase.rpc('set_ai_pause', { p_phone: phone, p_seconds: (args.minutes || 20) * 60 });
                    await sendBTZAPMessage(phone, "Chamando um atendente humano! 🙋‍♂️");
                } else if (call.function.name === 'save_bot_learning') {
                    // Regra de segurança: Só aprende do Gerente (Bypass)
                    const isManager = phone === BYPASS_NUMBER.replace(/\D/g, '');
                    if (isManager) {
                        const { error } = await supabase.from('bot_learnings').insert({ 
                            store_id: STORE_ID, 
                            instruction: args.instruction, 
                            context: `Aprendido com ${phone}` 
                        });
                        if (!error) {
                            await sendBTZAPMessage(phone, "Entendido! Aprendi essa nova regra e vou me lembrar disso daqui pra frente. 🧠✅");
                        } else {
                            await sendBTZAPMessage(phone, "Houve um erro ao salvar o aprendizado no banco de dados.");
                        }
                    } else {
                        await sendBTZAPMessage(phone, "Desculpe, apenas o Gerente pode me dar novas instruções persistentes.");
                    }
                }
            }
        } else if (aiMsg.content) {
            await sendBTZAPMessage(phone, aiMsg.content);
            await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'ai', p_content: aiMsg.content });
        }
    } catch (e: any) { customLog(`[ERRO]: ${e.message}`); }
}

const server = http.createServer((req, res) => {
    if (req.method === 'GET') { res.end('Papaleguas v3.18.33 Online!'); return; }
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                // Resposta imediata para evitar reenvios e manter a conexão livre
                res.writeHead(200);
                res.end();

                if (!body) return;
                const payload = JSON.parse(body);
                
                const owner = payload.owner || payload.data?.owner || 'Desconhecido';
                const instanceName = payload.instanceName || payload.instance || payload.data?.instance || 'Sem Nome';
                const baseUrl = payload.BaseUrl || 'https://server.btzap.com.br';

                if (INSTANCE_NUMBER) {
                    const cleanRequired = INSTANCE_NUMBER.replace(/\D/g, '').replace(/^55/, '');
                    const cleanOwner = String(owner || '').replace(/\D/g, '').replace(/^55/, '');
                    const cleanInstName = String(instanceName || '').replace(/\D/g, '').replace(/^55/, '');

                    if (!cleanOwner.includes(cleanRequired) && !cleanInstName.includes(cleanRequired) && !String(owner).includes(cleanRequired)) {
                       return;
                    }
                }

                const fromMe = payload.message?.fromMe === true || payload.data?.key?.fromMe === true || payload.fromMe === true;
                const msgId = payload.message?.id || payload.data?.key?.id;

                // Deduplicação imediata
                if (msgId && processedIds.has(msgId)) return;
                if (msgId) processedIds.add(msgId);

                const phoneRaw = payload.message?.sender_pn || payload.message?.chatid || payload.Telefone || payload.from || payload.data?.key?.remoteJid || '';
                const clean = phoneRaw.split('@')[0].replace(/\D/g, '');
                const phone = clean.replace(/^55/, ''); 

                if (!phone) return;

                // Detecção de áudio e mídia aprimorada (Captura múltiplos caminhos possíveis)
                const audioData = payload.data?.message?.audioMessage || payload.message?.audioMessage || 
                                 payload.data?.message?.viewOnceMessageV2?.message?.audioMessage ||
                                 payload.message?.content?.audioMessage ||
                                 payload.content?.audioMessage ||
                                 payload.audioMessage;


                const isAudio = !!audioData;
                const isMedia = (payload.message?.content?.imageMessage || payload.message?.imageMessage || payload.data?.message?.imageMessage || 
                                 payload.message?.stickerMessage || payload.message?.content?.stickerMessage ||
                                 payload.message?.videoMessage || payload.message?.content?.videoMessage);
                
                if (!fromMe && (isAudio || isMedia)) {
                    customLog(`[Webhook] Sinal detectado de ${phone}: ${isAudio ? 'ÁUDIO' : 'MÍDIA'}`);
                }
                
                if (fromMe) {
                    if (msgId && sentByBotIds.has(msgId)) return;
                    customLog(`[Atendente] Intervenção humana detectada para ${phone}. Pausando robô.`);
                    await supabase.rpc('set_ai_pause', { p_phone: phone, p_seconds: 1200 });
                    return;
                }

                // Negar imagens/mídias (excluindo áudio) conforme solicitado pelo usuário
                if (isMedia && !isAudio) {
                    customLog(`[Webhook] Mídia ignorada (Imagem/Figurinha/Vídeo) de ${phone}.`);
                    return;
                }

                let message = extractMessageText(payload.message || payload.data?.message || payload);
                
                if (isAudio) {
                    customLog(`[Webhook] Áudio detectado. Extraindo dados...`);
                    const audioUrl = audioData.URL || audioData.url || audioData.directPath || audioData.fileUrl;
                    const text = await transcribeAudio({
                        url: audioUrl,
                        id: msgId,
                        baseUrl: baseUrl,
                        base64: audioData.base64
                    });

                    if (text) {
                        // Combina a citação (se houver) com o áudio transcrito
                        message = message ? `${message}\n[Áudio]: ${text}` : text;
                        customLog(`[Transcrição]: ${text}`);
                    } else if (!message) {
                        // Fallback se não houver texto nem transcrição sucesso
                        await sendBTZAPMessage(phone, "Não consegui ouvir esse áudio. 😕 Se for algo sobre o seu pedido, pode digitar?");
                        return;
                    }
                }

                if (phone && message) {
                    const pushName = payload.message?.senderName || payload.pushName || payload.data?.pushName || 'Cliente';
                    let buf = messageBuffers.get(phone);
                    
                    const mediaInfo = isAudio ? { id: msgId, type: 'audio', baseUrl } : 
                                    (payload.message?.imageMessage || payload.data?.message?.imageMessage) ? { id: msgId, type: 'image', baseUrl } : null;

                    if (!buf) {
                        buf = { 
                            messages: [message], 
                            media: mediaInfo ? [mediaInfo] : [],
                            timer: setTimeout(() => processBuffer(phone, pushName), 12000) 
                        };
                        messageBuffers.set(phone, buf);
                    } else {
                        clearTimeout(buf.timer);
                        buf.messages.push(message);
                        if (mediaInfo) buf.media.push(mediaInfo);
                        buf.timer = setTimeout(() => processBuffer(phone, pushName), 12000);
                    }
                }
            } catch (e) { customLog(`[ERRO Webhook]: ${e}`); }
        });
    } else { res.writeHead(405); res.end(); }
});

server.listen(PORT, () => {
    customLog(`\n[PAPALEGUAS MASCOTE v3.18.33] ONLINE`);
    customLog(`[Status] Robô Ativo: ${IS_BOT_ENABLED} | Instância: ${PHONE_ID}`);
    if (process.send) {
        process.send({ type: 'whatsapp-status', data: { connection: 'connected' } });
    }
});
