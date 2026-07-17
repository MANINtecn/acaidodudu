"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappBot = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const supabase_js_1 = require("@supabase/supabase-js");
const openai_1 = __importDefault(require("openai"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
(0, v2_1.setGlobalOptions)({ region: "us-central1" });
const STORE_ID = 'ea802c0f-4b61-4dc5-8325-cf3d23a0a392';
exports.whatsappBot = (0, https_1.onRequest)({
    secrets: [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "BTZAP_API_URL",
        "BTZAP_API_KEY",
        "OPENAI_API_KEY"
    ],
    cors: true,
    invoker: "public"
}, async (req, res) => {
    try {
        console.log("--- Início do Processamento (Firebase) ---");
        const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
        const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
        const EVOLUTION_API_URL = (process.env.BTZAP_API_URL || "").trim();
        const EVOLUTION_API_KEY = (process.env.BTZAP_API_KEY || "").trim();
        const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
        const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const openai = new openai_1.default({ apiKey: OPENAI_API_KEY });
        const body = req.body;
        console.log("Request Body:", JSON.stringify(body));
        const data = body;
        const eventType = data.event || data.data?.event || body.event;
        if (eventType && eventType !== 'messages.upsert') {
            console.log(`Ignored event type: ${eventType}`);
            res.status(200).send('Ignored non-message event');
            return;
        }
        const msg = data.message || data.data?.message;
        if (!msg) {
            res.status(200).send('Not a message');
            return;
        }
        const msgTimestamp = msg.messageTimestamp || data.data?.messageTimestamp || data.messageTimestamp || msg.messageContextInfo?.deviceListMetadata?.timestamp;
        if (msgTimestamp) {
            const msgTimeMs = msgTimestamp * 1000;
            const nowMs = Date.now();
            if (nowMs - msgTimeMs > 120000) {
                console.log(`Ignored old message: ${msgTimestamp} (${Math.round((nowMs - msgTimeMs) / 1000)}s ago)`);
                res.status(200).send('Ignored old message');
                return;
            }
        }
        else {
            console.log(`Ignored message without timestamp`);
            res.status(200).send('Ignored no timestamp');
            return;
        }
        const remoteJid = msg.chatid || msg.key?.remoteJid;
        const fromMe = msg.fromMe ?? msg.key?.fromMe;
        const isGroup = msg.isGroup ?? (remoteJid?.includes('@g.us') || false);
        if (isGroup || !remoteJid) {
            console.log(`Ignored: isGroup=${isGroup}, jid=${remoteJid}`);
            res.status(200).send('Ignored');
            return;
        }
        const phone = remoteJid.replace('@s.whatsapp.net', '').replace(/^55/, '');
        if (fromMe) {
            let userMessageOriginal = msg.text || msg.conversation || msg.content?.text || msg.extendedTextMessage?.text || '';
            if (userMessageOriginal.endsWith('\u200B')) {
                console.log(`[System Message] Ignored system auto-reply for customer ${phone}.`);
                res.status(200).send('System Msg Ignored');
                return;
            }
            if (userMessageOriginal) {
                console.log(`[Admin Message] Saving for 20m Pause trigger for customer ${phone}...`);
                await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'admin', p_content: userMessageOriginal });
            }
            res.status(200).send('Admin Msg Saved (Recent)');
            return;
        }
        const instanceName = data.instanceName || data.data?.instanceName || process.env.BTZAP_INSTANCE_NAME || 'PapaleguasTOC';
        const ADMIN_TESTER_PHONES = ['32920007226', '32998540648'];
        const isTester = ADMIN_TESTER_PHONES.includes(phone);
        const btzapUrl = EVOLUTION_API_URL || "https://server.btzap.com.br";
        const [statusRes, pauseRes] = await Promise.all([
            supabase.rpc('get_bot_status_rpc', { p_store_id: STORE_ID }),
            supabase.rpc('is_ai_paused', { p_phone: phone })
        ]);
        const isEnabled = statusRes.data?.[0]?.is_bot_enabled ?? true;
        const isPaused = pauseRes.data ?? false;
        const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: recentAdminMsg } = await supabase
            .from('chat_histories')
            .select('created_at')
            .eq('phone', phone)
            .eq('role', 'admin')
            .gte('created_at', twentyMinutesAgo)
            .limit(1)
            .maybeSingle();
        if (recentAdminMsg && !isTester) {
            console.log(`[Human Intervention] Bot paused due to recent admin message at ${recentAdminMsg.created_at}`);
            res.status(200).send('Bot Paused by Admin (20m Protection)');
            return;
        }
        if ((!isEnabled || isPaused) && !isTester) {
            console.log(`Bot Offline: Enabled=${isEnabled}, Paused=${isPaused}, isTester=${isTester}`);
            res.status(200).send('Bot inactive');
            return;
        }
        let userMessage = msg.text || msg.conversation || msg.content?.text || msg.extendedTextMessage?.text || '';
        const audioMsg = msg.audioMessage || msg.content?.audioMessage;
        if (audioMsg) {
            console.log("Audio message detected!");
            if (msg.messageAudioEmTexto || data.messageAudioEmTexto) {
                userMessage = msg.messageAudioEmTexto || data.messageAudioEmTexto;
            }
            else {
                userMessage = "[Áudio Recebido - Por favor, envie em formato de texto para eu anotar seu pedido!]";
            }
        }
        if (!userMessage) {
            res.status(200).send('Empty message');
            return;
        }
        const msgId = msg.id || msg.key?.id;
        console.log(`Msg ID: ${msgId} | Phone: ${phone}`);
        const bufferRes = await supabase.rpc('handle_message_buffer', { p_phone: phone, p_message: userMessage });
        const bData = Array.isArray(bufferRes.data) ? bufferRes.data[0] : bufferRes.data;
        const bufferMode = bData?.mode;
        if (bufferMode === 'BUFFERED') {
            res.status(200).send('Buffered');
            return;
        }
        if (bufferMode === 'START_WAIT' || bufferMode === 'DIRECT') {
            await fetch(`${btzapUrl}/chat/presence/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'token': EVOLUTION_API_KEY },
                body: JSON.stringify({ number: `55${phone}`, presence: 'composing' })
            });
            const waitTime = 25000;
            console.log(`[Buffer] Waiting ${waitTime}ms for grouping...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            const clearRes = await supabase.rpc('get_and_clear_ai_buffer', { p_phone: phone });
            const bufferedMsgs = clearRes.data?.messages || [];
            if (bufferedMsgs.length > 0) {
                userMessage = bufferedMsgs.join('\n');
                console.log(`[Buffer] combined messages: \n${userMessage}`);
            }
        }
        const [menuRes, customerRes] = await Promise.all([
            supabase.rpc('get_menu_for_ai', { p_store_id: STORE_ID }),
            supabase.rpc('get_customer_for_ai', { p_store_id: STORE_ID, p_phone: phone })
        ]);
        const { data: activeOrder } = await supabase
            .from('orders')
            .select('id, status, total_amount, discount, delivery_fee, created_at, items(quantity, name, price, observation)')
            .eq('customer_phone', phone)
            .in('status', ['pending', 'preparing', 'delivering'])
            .order('created_at', { ascending: false })
            .maybeSingle();
        const activeOrderData = activeOrder ? {
            hasActiveOrder: true,
            status: activeOrder.status,
            displayId: activeOrder.id.slice(0, 8),
            items: activeOrder.items
        } : { hasActiveOrder: false, status: null };
        const menuData = menuRes.data || 'Cardápio não carregado.';
        const customerData = customerRes.data || 'Cliente Novo.';
        const systemPrompt = `
 Você é o Papaléguas Mascote, o atendente oficial da lanchonete "Papaléguas Lanches". 🏃‍♂️💨🍔

REGRA DE MISSÃO: Sua missão é guiar o cliente até o fechamento do pedido com agilidade, mas de forma **humana, natural e sem parecer um robô**. 

### CONTEXTO DO SISTEMA:
- Pedido Ativo: ${activeOrderData.hasActiveOrder ? 'SIM' : 'NÃO'} (Status: "${activeOrderData.status || 'Nenhum'}", #${activeOrderData.displayId || 'N/A'})
- Itens Ativos: ${activeOrderData.items ? JSON.stringify(activeOrderData.items) : 'Nenhum'}
- Telefone: "${phone}"
- Cadastro: ${typeof customerData === 'string' ? customerData : JSON.stringify(customerData || {})}

### REGRAS DE OURO (COMPORTAMENTO HUMANO):
1. **SAUDAÇÃO INICIAL (RESTRITA)**: Você SÓ deve dar as boas-vindas se o histórico abaixo estiver VAZIO ou se o cliente apenas disse algo como "Oi", "Bom dia", "Olá". Se o cliente já pediu algo ou o histórico tem mensagens recentes, pule a saudação e vá direto ao ponto.
2. **OUÇA E CONFIRME**: Quando o cliente pedir algo ou mudar um item (ex: "sem alface"), confirme de forma natural: "Beleza, já anotei aqui: 1 X-Tudo sem alface! 🍔✅ Quer aproveitar e levar uma Coca gelada?"
3. **CONTEXTO SEMPRE**: Use o histórico para saber que mensagens curtas como "Sim", "Não", "Tira o ovo" se referem ao que foi falado imediatamente antes.
4. **PEDIDO ATIVO**: Se já existe um pedido ('hasActiveOrder' TRUE), inicie oferecendo: A) Acompanhar, B) Atualizar/Novo, C) Pedir Mais.
5. **DADOS FINAIS**: Só finalize (create_order) após coletar: Nome, Endereço Completo, Referência e Pagamento (Dinheiro, Cartão ou Pix). Peça confirmação final antes de lançar.

### CARDÁPIO E PREÇOS:
${menuData}

Personalidade: Divertido, direto e muito prestativo. Use emojis adequados.
    `;
        const openAiTools = [
            {
                type: "function",
                function: {
                    name: "create_order",
                    description: "Cria o pedido oficial no sistema. Use quando o cliente confirmar tudo.",
                    parameters: {
                        type: "object",
                        properties: {
                            customer: {
                                type: "object",
                                properties: { name: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, reference: { type: "string" } },
                                required: ["name", "phone", "address"]
                            },
                            order: {
                                type: "object",
                                properties: {
                                    type: { type: "string", enum: ["Entrega", "Retirada"] },
                                    paymentMethod: { type: "string", enum: ["Dinheiro", "Cartão", "Pix"] },
                                    changeFor: { type: "string" },
                                    deliveryFee: { type: "number" },
                                    total: { type: "number" }
                                },
                                required: ["type", "paymentMethod", "total", "deliveryFee"]
                            },
                            items: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: { name: { type: "string" }, quantity: { type: "number" }, price: { type: "number" }, notes: { type: "string" } },
                                    required: ["name", "quantity", "price"]
                                }
                            }
                        },
                        required: ["customer", "order", "items"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "cancel_active_orders",
                    description: "Cancela pedidos ativos.",
                    parameters: { type: "object", properties: {} }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_customer_registration",
                    description: "Atualiza cadastro de endereço ou nome.",
                    parameters: {
                        type: "object",
                        properties: { name: { type: "string" }, address: { type: "string" }, reference: { type: "string" } }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "set_customer_ignore",
                    description: "Ignora o cliente por um tempo determinado quando ele deve ser atendido por humano ou é de outro app.",
                    parameters: {
                        type: "object",
                        properties: { minutes: { type: "number", description: "Minutos para ignorar" } },
                        required: ["minutes"]
                    }
                }
            }
        ];
        const { data: dbHistory } = await supabase
            .from('chat_histories')
            .select('message, created_at')
            .eq('session_id', phone + '-v1')
            .order('created_at', { ascending: false })
            .limit(30);
        const formattedHistoryParts = [];
        if (dbHistory && dbHistory.length > 0) {
            const chronologicalHistory = [...dbHistory].reverse();
            for (const log of chronologicalHistory) {
                const msgData = log.message;
                if (!msgData)
                    continue;
                let role = "user";
                if (msgData.type === "ai" || msgData.type === "admin") {
                    role = "assistant";
                }
                if (msgData.content && msgData.content.trim() !== '') {
                    formattedHistoryParts.push({ role, content: msgData.content });
                }
            }
        }
        const messages = [
            { role: "system", content: systemPrompt },
            ...formattedHistoryParts,
            { role: "user", content: userMessage }
        ];
        let wasCancelled = false;
        async function callOpenAI(msgs) {
            console.log(`Generating AI Response...`);
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: msgs,
                tools: openAiTools,
                tool_choice: "auto",
            });
            const choice = response.choices[0];
            const message = choice.message;
            let accumulatedContent = message.content || "";
            if (message.tool_calls && message.tool_calls.length > 0) {
                msgs.push(message);
                for (const toolCall of message.tool_calls) {
                    console.log(`Function Call: ${toolCall.function.name}`);
                    const args = JSON.parse(toolCall.function.arguments);
                    let functionResponse;
                    if (toolCall.function.name === "create_order") {
                        const orderPayload = args.order || {};
                        if (wasCancelled && activeOrderData.displayId) {
                            orderPayload.dailyOrderNumber = activeOrderData.displayId;
                        }
                        const res = await supabase.rpc('create_order_via_n8n', {
                            p_store_id: STORE_ID,
                            p_customer: args.customer,
                            p_order: orderPayload,
                            p_items: args.items
                        });
                        const orderData = res.data;
                        if (orderData && orderData.success) {
                            functionResponse = { message: "Sucesso", numero: orderData.dailyOrderNumber || orderData.orderId };
                        }
                        else {
                            functionResponse = { error: "Erro banco", details: orderData?.error };
                        }
                    }
                    else if (toolCall.function.name === "cancel_active_orders") {
                        wasCancelled = true;
                        const res = await supabase.rpc('cancel_active_orders_via_n8n', { p_phone: phone, p_store_id: STORE_ID });
                        functionResponse = res.data;
                    }
                    else if (toolCall.function.name === "update_customer_registration") {
                        const res = await supabase.rpc('update_customer_registration_via_n8n', { p_phone: phone, p_store_id: STORE_ID, ...args });
                        functionResponse = res.data;
                    }
                    else if (toolCall.function.name === "set_customer_ignore") {
                        const res = await supabase.rpc('set_customer_ignore', { p_phone: phone, p_store_id: STORE_ID, p_minutes: args.minutes || 40 });
                        functionResponse = res.data;
                    }
                    msgs.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: toolCall.function.name,
                        content: JSON.stringify(functionResponse || {})
                    });
                }
                const nextContent = await callOpenAI(msgs);
                return (accumulatedContent + "\n" + nextContent).trim();
            }
            return accumulatedContent;
        }
        let rawResponseText = await callOpenAI(messages);
        let responseText = rawResponseText.replace(/^(IA|Bot|Atendente|Papaléguas):\s*/i, '').trim();
        await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'human', p_content: userMessage });
        await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'ai', p_content: responseText });
        const cleanUrl = btzapUrl.replace(/\/$/, '');
        const finalUrl = `${cleanUrl}/send/text`;
        const btzapResponse = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': EVOLUTION_API_KEY },
            body: JSON.stringify({ number: `55${phone}`, text: responseText })
        });
        if (!btzapResponse.ok) {
            const errText = await btzapResponse.text();
            console.error("BTZAP Error:", errText);
        }
        console.log("--- Fim do Processamento com SUCESSO ---");
        res.status(200).send('OK');
    }
    catch (error) {
        console.error("CRITICAL ERROR:", error);
        res.status(500).send(`Error: ${error.message}`);
    }
});
//# sourceMappingURL=index.js.map