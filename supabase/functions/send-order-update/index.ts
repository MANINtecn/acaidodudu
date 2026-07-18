import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const EVOLUTION_API_URL = Deno.env.get('BTZAP_API_URL') || "https://server.btzap.com.br";
const BTZAP_TOKEN = Deno.env.get('BTZAP_TOKEN') || "";
const INSTANCE_NAME = Deno.env.get('BTZAP_INSTANCE_NAME') || 'AcaiDoDudu';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { phone, status, orderId, customerName } = payload;

    console.log(`[Notification] Order #${orderId} -> ${status} (Phone: ${phone})`);

    if (!phone || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!BTZAP_TOKEN) {
      console.error('[Notification] BTZAP_TOKEN missing');
      return new Response(
        JSON.stringify({ error: 'Config error: BTZAP_TOKEN missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let message = '';
    const name = customerName ? customerName.split(' ')[0] : 'Cliente';

    switch (status) {
      case 'Em Produção':
        message = `🔥 *Seu pedido entrou em produção!*\n\nOlá ${name}, já começamos a preparar seu pedido. Daqui a pouco ele sai quentinho! 🍔`;
        break;
      case 'A Caminho':
        message = `🛵 *Seu pedido está a caminho!*\n\nO motoboy já está levando seu pedido #${orderId}. Fique atento ao portão ou interfone!`;
        break;
      case 'No Portão':
        message = `📍 *O motoboy está no seu portão!*\n\nOlá ${name}, o entregador chegou. Por favor, receba seu pedido #${orderId}. 🔔`;
        break;
      case 'Entregue':
        message = `✅ *Pedido Entregue!*\n\nObrigado pela preferência, ${name}! Se puder, avalie nosso atendimento. Até a próxima! 😋`;
        break;
      case 'Pronto':
        message = `🛍️ *Pedido Pronto para Retirada!*\n\nSeu pedido #${orderId} já está te esperando aqui no balcão. Pode vir buscar!`;
        break;
      case 'Cancelado':
        message = `❌ *Pedido Cancelado*\n\nOlá ${name}, seu pedido #${orderId} foi cancelado.`;
        break;
      default:
        return new Response(JSON.stringify({ message: 'No notification needed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    message += '\u200B';

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length <= 11 && !cleanPhone.startsWith('55')) {
        cleanPhone = `55${cleanPhone}`;
    }

    // Simplificação da URL conforme o servidor.ts que já funciona
    const btzapUrlClean = EVOLUTION_API_URL.replace(/\/$/, '');
    const targetUrl = `${btzapUrlClean}/send/text`;
    
    console.log(`[Notification] Sending to ${targetUrl} for number ${cleanPhone}`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': BTZAP_TOKEN
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: message,
        options: { delay: 1200, presence: 'composing' }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Notification] BTZAP Error:', result);
      throw new Error(`BTZAP Error: ${JSON.stringify(result)}`);
    }

    return new Response(
      JSON.stringify({ success: true, btzap_result: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Notification] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

