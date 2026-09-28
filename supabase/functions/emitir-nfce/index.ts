// emitir-nfce — Edge Function, Fase 2 do plano fiscal (28/09/2026).
// Ver claude-acai.md, "ARQUITETURA TECNICA DA NFC-e".
//
// PONTO UNICO de contato com qualquer API fiscal (Focus NFe, eNotas, etc).
// O front (Electron) NUNCA fala direto com o provedor -- so chama esta
// funcao passando o ID da nota (ja gravada como 'pendente' pelo
// supabaseService.ts, ANTES desta chamada). O token de cada provedor vive
// SO como secret desta funcao (`supabase secrets set FOCUS_NFE_TOKEN=...`),
// nunca em coluna de tabela nem em variavel do bundle Electron -- o .exe
// roda na maquina do cliente e qualquer coisa embutida nele e extraivel.
//
// PLUG-AND-PLAY POR LOJA (pedido do Ikarus, 28/09/2026): cada copia do app
// atende um cliente diferente (ver claude-acai.md, "Um Supabase por
// cliente"), cada um pode contratar um provedor de nota diferente. A loja
// escolhe o provedor pelo campo `provedor_api` em `fiscal_config` (tela
// Admin -> Nota Fiscal) -- esta funcao LE esse campo e roteia para o
// adaptador certo. Trocar de provedor e' trocar esse campo + o secret,
// nunca mexer neste arquivo.
//
// ⚠️ NENHUM PROVEDOR CONTRATADO AINDA (28/09/2026). Os adaptadores abaixo
// sao ESQUELETOS -- a assinatura (parametros, formato de resposta) de cada
// provedor real so pode ser preenchida depois de ler a documentacao dele.
// Por ora, TODO adaptador cai no fallback que marca a nota como pendente
// sem chamar nada, para nao quebrar o app enquanto isso nao for decidido.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EmitirPayload {
  notaFiscalId: string;
  storeId: string;
  orderId: string;
}

interface ResultadoEmissao {
  sucesso: boolean;
  chaveAcesso?: string;
  protocoloAutorizacao?: string;
  xml?: string;
  danfeUrl?: string;
  motivoRejeicao?: string;
  /** true = falha de comunicacao (Sefaz/provedor fora do ar) -> contingencia, NAO rejeicao. */
  eContingencia?: boolean;
}

/**
 * Adaptador Focus NFe -- ESQUELETO. Preencher quando contratado.
 * Doc: https://focusnfe.com.br/doc/
 */
async function emitirViaFocusNFe(_config: any, _nota: any, _itens: any[]): Promise<ResultadoEmissao> {
  const token = Deno.env.get('FOCUS_NFE_TOKEN');
  if (!token) {
    return { sucesso: false, eContingencia: true, motivoRejeicao: 'Focus NFe nao configurado (FOCUS_NFE_TOKEN ausente)' };
  }
  // TODO: montar o payload da NFC-e conforme o layout do Focus NFe e
  // chamar POST https://api.focusnfe.com.br/v2/nfce (ou homologacao)
  // usando Basic Auth com o token. Ver claude-acai.md para os dados reais
  // ja levantados (CFOP/CSOSN por produto, CSC, serie).
  return { sucesso: false, eContingencia: true, motivoRejeicao: 'Adaptador Focus NFe ainda nao implementado' };
}

/**
 * Adaptador eNotas -- ESQUELETO. Preencher quando contratado.
 * Achado em 21/09/2026: o Multipedidos ja usa eNotas por baixo
 * (verProc=eNotasGW 2.0 nos XMLs reais), vale cotar direto.
 * Doc: https://enotasgw.com.br/doc/
 */
async function emitirViaENotas(_config: any, _nota: any, _itens: any[]): Promise<ResultadoEmissao> {
  const apiKey = Deno.env.get('ENOTAS_API_KEY');
  if (!apiKey) {
    return { sucesso: false, eContingencia: true, motivoRejeicao: 'eNotas nao configurado (ENOTAS_API_KEY ausente)' };
  }
  // TODO: montar o payload conforme o layout do eNotas e chamar a API.
  return { sucesso: false, eContingencia: true, motivoRejeicao: 'Adaptador eNotas ainda nao implementado' };
}

/** Roteador: escolhe o adaptador certo a partir de fiscal_config.provedor_api. */
async function emitirNotaFiscal(provedor: string | null | undefined, config: any, nota: any, itens: any[]): Promise<ResultadoEmissao> {
  switch ((provedor || '').toLowerCase()) {
    case 'focus_nfe':
    case 'focusnfe':
      return emitirViaFocusNFe(config, nota, itens);
    case 'enotas':
      return emitirViaENotas(config, nota, itens);
    default:
      // Nenhum provedor configurado ainda -- fica em contingencia (a nota
      // ja esta gravada como 'pendente' no banco, a venda ja aconteceu).
      return {
        sucesso: false,
        eContingencia: true,
        motivoRejeicao: provedor
          ? `Provedor '${provedor}' desconhecido`
          : 'Nenhum provedor de API fiscal configurado ainda (fiscal_config.provedor_api vazio)',
      };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload: EmitirPayload = await req.json();
    const { notaFiscalId, storeId } = payload;

    if (!notaFiscalId || !storeId) {
      return new Response(JSON.stringify({ error: 'notaFiscalId e storeId sao obrigatorios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: nota, error: notaErr } = await supabase
      .from('notas_fiscais').select('*').eq('id', notaFiscalId).single();
    if (notaErr || !nota) throw notaErr || new Error('Nota fiscal nao encontrada');

    const { data: config, error: configErr } = await supabase
      .from('fiscal_config').select('*').eq('store_id', storeId).single();
    if (configErr || !config) throw configErr || new Error('fiscal_config nao encontrada para esta loja');

    const { data: order } = await supabase
      .from('orders').select('items').eq('id', nota.order_id).maybeSingle();
    const itens = order?.items || [];

    const resultado = await emitirNotaFiscal(config.provedor_api, config, nota, itens);

    if (resultado.sucesso) {
      await supabase.from('notas_fiscais').update({
        status: 'autorizada',
        chave_acesso: resultado.chaveAcesso,
        protocolo_autorizacao: resultado.protocoloAutorizacao,
        xml: resultado.xml,
        danfe_url: resultado.danfeUrl,
      }).eq('id', notaFiscalId);
    } else if (resultado.eContingencia) {
      // Falha de comunicacao (Sefaz/provedor fora do ar OU nao configurado
      // ainda) -- NAO e' rejeicao definitiva. Marca para reprocessar depois,
      // incrementa contador de tentativas. A venda ja aconteceu, nao mexe nela.
      await supabase.from('notas_fiscais').update({
        status: 'contingencia',
        motivo_rejeicao: resultado.motivoRejeicao,
        tentativas_reprocessamento: (nota.tentativas_reprocessamento || 0) + 1,
        ultima_tentativa_em: new Date().toISOString(),
      }).eq('id', notaFiscalId);
    } else {
      // Rejeicao definitiva da Sefaz (ex: dado invalido) -- precisa de
      // correcao manual, nao adianta so tentar de novo sozinho.
      await supabase.from('notas_fiscais').update({
        status: 'rejeitada',
        motivo_rejeicao: resultado.motivoRejeicao,
      }).eq('id', notaFiscalId);
    }

    return new Response(JSON.stringify({ ok: true, resultado }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[emitir-nfce] Erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
