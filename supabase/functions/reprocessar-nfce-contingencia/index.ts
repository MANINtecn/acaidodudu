// reprocessar-nfce-contingencia — Fase 2 do plano fiscal (28/09/2026).
//
// Regra de contingencia offline (skill nfce, item 3): se a Sefaz cair no
// momento da venda, a venda NAO PODE PARAR -- a nota fica 'pendente' ou
// 'contingencia' e e' reenviada depois. Esta funcao e' esse "depois": varre
// todas as lojas com notas em fila e tenta reemitir, reaproveitando o mesmo
// roteador de provedor da `emitir-nfce`.
//
// Como rodar: agendar via `supabase functions schedule` (cron) de poucos em
// poucos minutos, OU chamar manualmente pelo botao "Reprocessar pendentes"
// na tela Nota Fiscal (Fase 3). Nao ha cron configurado ainda -- decisao de
// quando ligar isso fica para depois que houver provedor contratado e as
// primeiras notas reais em contingencia.
//
// Limite de tentativas: para de tentar sozinho depois de MAX_TENTATIVAS,
// para nao ficar martelando um erro de dado (CFOP invalido, por exemplo)
// que so correcao manual resolve -- mesmo raciocinio do boot-retry do
// Electron (2 tentativas automaticas, depois pede acao manual).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_TENTATIVAS = 5;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: pendentes, error } = await supabase
      .from('notas_fiscais')
      .select('id, store_id, tentativas_reprocessamento')
      .in('status', ['pendente', 'contingencia'])
      .lt('tentativas_reprocessamento', MAX_TENTATIVAS)
      .order('numero', { ascending: true }); // respeita a ordem, nunca pula numero
    if (error) throw error;

    const resultados: any[] = [];
    for (const nota of pendentes || []) {
      // Reaproveita a mesma Edge Function de emissao -- um so lugar decide
      // o adaptador do provedor, nunca duplicar essa logica aqui.
      const { data, error: invokeErr } = await supabase.functions.invoke('emitir-nfce', {
        body: { notaFiscalId: nota.id, storeId: nota.store_id, orderId: null },
      });
      resultados.push({ notaFiscalId: nota.id, ok: !invokeErr, data, error: invokeErr?.message });
    }

    return new Response(JSON.stringify({ processadas: resultados.length, resultados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[reprocessar-nfce-contingencia] Erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
