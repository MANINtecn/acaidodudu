import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EVOLUTION_API_URL = Deno.env.get('BTZAP_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('BTZAP_API_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// Store ID (Fixed for this instance)
const STORE_ID = Deno.env.get('STORE_ID') || ''

Deno.serve(async (req) => {
  try {
    console.log("--- Início do Processamento ---");
    console.log("BOT DESATIVADO: Redirecionando para n8n.");
    return new Response('Bot deactivated in Supabase. Use n8n instead.', { status: 200 });

    const body = await req.json()
    const data = body
    
    // 1. Adapter & Filtering
    const eventType = data.event || data.data?.event || body.event;
    if (eventType && eventType !== 'messages.upsert') {
      console.log(`Ignored event type: ${eventType}`);
      return new Response('Ignored non-message event', { status: 200 });
    }

    const msg = data.message || data.data?.message;
    if (!msg) return new Response('Not a message', { status: 200 });

    const msgTimestamp = msg.messageTimestamp || data.data?.messageTimestamp || data.messageTimestamp || msg.messageContextInfo?.deviceListMetadata?.timestamp;
    
    if (msgTimestamp) {
      const msgTimeMs = msgTimestamp * 1000;
      const nowMs = Date.now();
      // If message is older than 2 minutes (120000 ms), ignore it. 
      // This prevents History Sync from draining the quota instantly when changing/connecting devices.
      if (nowMs - msgTimeMs > 120000) {
          console.log(`Ignored old message: ${msgTimestamp} (${Math.round((nowMs - msgTimeMs)/1000)}s ago)`);
          return new Response('Ignored old message', { status: 200 });
      }
    } else {
        console.log(`Ignored message without timestamp (Possible History Sync/Invalid Payload)`);
        return new Response('Ignored no timestamp', { status: 200 });
    }

    const remoteJid = msg.chatid || msg.key?.remoteJid || data.remoteJid;
    const fromMe = msg.fromMe ?? msg.key?.fromMe ?? data.fromMe ?? data.data?.fromMe ?? false;
    const isGroup = msg.isGroup ?? (remoteJid?.includes('@g.us') || false);

    if (isGroup || !remoteJid) {
      console.log(`Ignored: isGroup=${isGroup}, jid=${remoteJid}`);
      return new Response('Ignored', { status: 200 })
    }

    const phone = remoteJid.replace('@s.whatsapp.net', '').replace(/^55/, '')
    
    // 1.1 Handle "fromMe" (Admin/Human Message)
    if (fromMe) {
        let userMessageOriginal = msg.text || msg.conversation || msg.content?.text || msg.extendedTextMessage?.text || '';
        
        // Verifica assinatura invisível de sistema (\u200B)
        if (userMessageOriginal.endsWith('\u200B')) {
            console.log(`[System Message] Ignored system auto-reply for customer ${phone}. Not pausing bot.`);
            return new Response('System Msg Ignored', { status: 200 });
        }

        if (userMessageOriginal) {
            console.log(`[Admin Message] Saving to history and triggering 20m Pause for customer ${phone}...`);
            await Promise.all([
                supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'admin', p_content: userMessageOriginal }),
                supabase.rpc('set_ai_pause', { p_phone: phone, p_seconds: 1200 }) // 20 minutes
            ]);
            console.log(`[Pause] Bot paused for ${phone} due to admin intervention.`);
        }
        return new Response('Admin Msg Saved & Bot Paused', { status: 200 });
    }

    const instanceName = data.instanceName || data.data?.instanceName || Deno.env.get('BTZAP_INSTANCE_NAME') || 'AcaiDoDudu';
    
    // --- MASTER OVERRIDE / TESTERS ---
    const ADMIN_TESTER_PHONES = ['32920007226', '32998540648'];
    const isTester = ADMIN_TESTER_PHONES.includes(phone);

    const btzapUrl = EVOLUTION_API_URL || "https://server.btzap.com.br";

    // 2. Check Bot Status & Pause
    const [statusRes, pauseRes] = await Promise.all([
      supabase.rpc('get_bot_status_rpc', { p_store_id: STORE_ID }),
      supabase.rpc('is_ai_paused', { p_phone: phone })
    ]);

    const isEnabled = statusRes.data?.[0]?.is_bot_enabled ?? true;
    const isPaused = pauseRes.data ?? false;

    // --- CHECK FOR ADMIN INTERVENTION (20m PAUSE) ---
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
        return new Response('Bot Paused by Admin (20m Protection)', { status: 200 });
    }

    if ((!isEnabled || isPaused) && !isTester) {
      console.log(`Bot Offline: Enabled=${isEnabled}, Paused=${isPaused}, isTester=${isTester}`);
      return new Response('Bot inactive', { status: 200 });
    }

    // 3. Message Buffer (Anti-Racing)
    let userMessage = msg.text || msg.conversation || msg.content?.text || msg.extendedTextMessage?.text || '';
    
    const audioMsg = msg.audioMessage || msg.content?.audioMessage;
    // Note: We bypass audio for now as Evolution API often handles STT (Speech-to-Text).
    // If not, we can implement OpenAI Whisper later.
    if (audioMsg) {
        console.log("Audio message detected! Assuming Evolution API already converted or replying failure.");
        if (msg.messageAudioEmTexto || data.messageAudioEmTexto) {
            userMessage = msg.messageAudioEmTexto || data.messageAudioEmTexto;
        } else {
             userMessage = "[Áudio Recebido - Por favor, envie em formato de texto para eu anotar seu pedido, pois estou sem meus ouvidos da IA no momento!]";
        }
    }

    if (!userMessage) return new Response('Empty message', { status: 200 });

    const msgId = msg.id || msg.key?.id;
    console.log(`Msg ID: ${msgId} | Phone: ${phone}`);

    const bufferRes = await supabase.rpc('handle_message_buffer', { p_phone: phone, p_message: userMessage });
    const bData = Array.isArray(bufferRes.data) ? bufferRes.data[0] : bufferRes.data;
    const bufferMode = bData?.mode;
    
    if (bufferMode === 'BUFFERED') {
      return new Response('Buffered', { status: 200 });
    }

    if (bufferMode === 'START_WAIT') {
      await fetch(`${btzapUrl}/chat/presence/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': EVOLUTION_API_KEY },
        body: JSON.stringify({ number: `55${phone}`, presence: 'composing' })
      });

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentHistory } = await supabase
        .from('chat_histories')
        .select('created_at')
        .eq('phone', phone)
        .gte('created_at', oneHourAgo)
        .limit(1)
        .maybeSingle();

      const waitTime = recentHistory ? 6000 : 4000;
      
      console.log(`[Dynamic Wait] Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      const clearRes = await supabase.rpc('get_and_clear_ai_buffer', { p_phone: phone });
      const bufferedMsgs = clearRes.data?.messages || [];
      if (bufferedMsgs.length > 0) {
          userMessage = bufferedMsgs.join('\n');
          console.log(`[Buffer] Triggered AI with combined messages: \n${userMessage}`);
      }
    } else {
       // Se o modo for 'PASSTHROUGH' ou inexistente, garante que não tentou passar algo vazio no meio de um buffer
       console.log(`[Buffer] Passed directly (No wait): ${userMessage}`);
    }

    // 4. Fetch AI Context 
    const [menuRes, customerRes] = await Promise.all([
      supabase.rpc('get_menu_for_ai', { p_store_id: STORE_ID }),
      supabase.rpc('get_customer_for_ai', { p_store_id: STORE_ID, p_phone: phone })
    ]);

    const { data: activeOrder } = await supabase
       .from('orders')
       .select('id, status, total, discount, delivery_fee, timestamp, items')
       .eq('phone', phone)
       .in('status', ['Novo', 'Aceito', 'Preparando', 'Pronto', 'Em Entrega'])
       .order('timestamp', { ascending: false })
       .maybeSingle();

    const activeOrderData = activeOrder ? {
       hasActiveOrder: true,
       status: activeOrder.status,
       displayId: activeOrder.id.slice(0, 8),
       items: activeOrder.items
    } : { hasActiveOrder: false, status: null };

    const menuData = menuRes.data || 'Cardápio não carregado.'; 
    const customerData = customerRes.data || 'Cliente Novo.';
    
    await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'human', p_content: userMessage });

    // 5. Build OpenAI Prompt and Tools
    const systemPrompt = `
      ### DADOS DE RASTREAMENTO (SISTEMA):
      - Pedido Ativo Encontrado: ${activeOrderData.hasActiveOrder ? 'SIM' : 'NÃO'}
      - Status no Banco de Dados: "${activeOrderData.status || 'Nenhum'}"
      - Número do Pedido: #${activeOrderData.displayId || 'N/A'} (Use SEMPRE este número curto).
      - ITENS NO PEDIDO ATUAL: ${activeOrderData.items ? JSON.stringify(activeOrderData.items) : 'Nenhum item.'}

      ### DADOS DO CLIENTE (SISTEMA):
      - Telefone do Usuário: "${phone}" (USAR ESTE NÚMERO NA FUNÇÃO create_order).
      - O telefone JÁ É CONHECIDO. NÃO PERGUNTE "Qual seu telefone?".
      - DADOS CADASTRAIS: ${typeof customerData === 'string' ? customerData : JSON.stringify(customerData || {})}

      ### REGRAS DE OURO:
      1. INÍCIO DE CONVERSA: Se o cliente disse "Oi", Responda: "Olá! 😃 Para agilizar, peça pelo nosso App: ${Deno.env.get('APP_URL') || 'nosso site (em breve)'} Ou me fale o que deseja aqui."
      2. NUNCA pergunte o telefone da pessoa.
      3. CARRINHO DE COMPRAS: Você DEVE SEMPRE ler o histórico da conversa para lembrar dos itens que o cliente pediu. Nunca esqueça os itens mesmo se o cliente apenas mandar o endereço agora.
      4. ESTRATÉGIA DE VENDAS: Se pediu comida mas não bebida, sugira uma bebida uma única vez.
      5. CONFIRMAÇÃO FINAL: Mostre o resumo do pedido com todos os itens do histórico e o total (incluindo taxa de entrega). Pergunte "Podemos finalizar?".
      6. GERAÇÃO DE PEDIDO (OBRIGATÓRIO): ASSIM QUE O CLIENTE CONFIRMAR (TUDO OK, PODE MANDAR, ETC), VOCÊ TEM A OBRIGAÇÃO DE EXECUTAR A FUNÇÃO "create_order" IMEDIATAMENTE (NUNCA ESPERE MAIS).
      7. APÓS A FUNÇÃO EXECUTAR: Responda ao cliente e diga apenas "Pedido lançado com sucesso! Muito obrigado pela preferência! 🍔🚀"
      8. Cancele e recrie se houver alteração usando a função cancel_active_orders.
      9. SE O CLIENTE PEDIR STATUS: Olhe o status e responda o status exato.

      ### ITENS E TAXAS:
      - CARDÁPIO: ${menuData}
      - Taxas: Centro 2.00 | Bairros 4.00 | Rural 6.00.
    `;

    const openAiTools = [
      {
        type: "function",
        function: {
          name: "create_order",
          description: "Cria o pedido oficial no sistema. Use quando o cliente confirmar tudo (Itens, Endereço e Pagamento).",
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
          description: "Cancela pedidos ativos. Use se o cliente quiser cancelar ou alterar um pedido já feito.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function",
        function: {
          name: "update_customer_registration",
          description: "Atualiza o cadastro de endereço ou nome passados pelo cliente.",
          parameters: {
            type: "object",
            properties: { name: { type: "string" }, address: { type: "string" }, reference: { type: "string" } }
          }
        }
      }
    ];

    console.log(`Tracking Debug | Phone: ${phone} | hasOrder: ${activeOrderData.hasActiveOrder} | Status: ${activeOrderData.status}`);
    const { data: dbHistory } = await supabase
        .from('chat_histories')
        .select('*')
        .eq('session_id', `${phone}-v1`)
        .order('created_at', { ascending: false })
        .limit(50);
        
    const formattedHistoryParts = [];
    if (dbHistory && dbHistory.length > 0) {
        // Reverse so chronological order is correct
        const chronologicalHistory = dbHistory.reverse();
        for (const log of chronologicalHistory) {
             let role = "user"; // "human" -> "user"
             if (log.role === "ai" || log.role === "admin") {
                 role = "assistant"; 
             }
             if (log.content && log.content.trim() !== '') {
                 formattedHistoryParts.push({ role, content: log.content });
             }
        }
    }

    const messages = [
        { role: "system", content: systemPrompt },
        ...formattedHistoryParts,
        { role: "user", content: userMessage }
    ];

    let wasCancelled = false;

    // Recursive function to handle OpenAI chat + Tool Calling
    async function callOpenAI(msgs: any[]): Promise<string> {
        console.log(`Generating AI Response with gpt-4o-mini...`);
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: msgs,
            tools: openAiTools as any,
            tool_choice: "auto",
        });

        const choice = response.choices[0];
        const message = choice.message;
        
        if (message.tool_calls && message.tool_calls.length > 0) {
            msgs.push(message); // Add assistant's tool call message
            
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
                    } else {
                        functionResponse = { error: "Erro banco", details: orderData?.error };
                    }
                } else if (toolCall.function.name === "cancel_active_orders") {
                    wasCancelled = true;
                    const res = await supabase.rpc('cancel_active_orders_via_n8n', { p_phone: phone, p_store_id: STORE_ID });
                    functionResponse = res.data;
                } else if (toolCall.function.name === "update_customer_registration") {
                    const res = await supabase.rpc('update_customer_registration_via_n8n', { p_phone: phone, p_store_id: STORE_ID, ...args });
                    functionResponse = res.data;
                }

                // Add tool response to messages
                msgs.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: toolCall.function.name,
                    content: JSON.stringify(functionResponse || {})
                });
            }
            // Recall API with the tool results
            return await callOpenAI(msgs);
        }

        // Base case: Assistant provided a text response
        return message.content || "";
    }

    let rawResponseText = await callOpenAI(messages);
    let responseText = rawResponseText.replace(/^(IA|Bot|Atendente|Açaí do Dudu):\s*/i, '').trim();
    
    console.log("Saving AI Response to history...");
    await supabase.rpc('add_chat_msg', { p_phone: phone, p_role: 'ai', p_content: responseText });

    console.log("Sending response via BTZAP...");
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
        throw new Error(`BTZAP Send failed to [${finalUrl}] (Status ${btzapResponse.status}): ${errText}`);
    }

    console.log("--- Fim do Processamento com SUCESSO ---");
    return new Response('OK', { status: 200 });

  } catch (error: any) {
    console.error("CRITICAL ERROR:", error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});

