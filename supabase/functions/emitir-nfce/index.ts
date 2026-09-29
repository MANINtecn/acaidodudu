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
// ATUALIZACAO 29/09/2026: adaptador `emitirViaBrasilNFe` implementado de
// verdade (nao e' mais esqueleto) -- documentacao lida em brasilnfe.com.br
// (empresa real, CNPJ 39.658.743/0001-99, plano R$49,90/mes ilimitado,
// ver claude-acai.md). Focus NFe e eNotas continuam ESQUELETO ate serem
// escolhidos/testados -- Ikarus decidiu testar Brasil NFe primeiro em
// homologacao antes de qualquer contrato.

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

/**
 * Adaptador Brasil NFe -- IMPLEMENTADO, 29/09/2026.
 * Doc: https://brasilnfe.com.br/api/nf-e-e-nfc-e (payload), /api/empresas
 * (cadastro de empresa + certificado + CSC).
 *
 * PLUG-AND-PLAY (pedido do Ikarus, 28-29/09/2026): os 2 tokens abaixo sao
 * secrets desta Edge Function, NUNCA colunas de tabela nem variavel do
 * bundle Electron. `BRASIL_NFE_TOKEN_EMPRESA` e' especifico de cada loja/
 * cliente (cada copia do app = 1 Supabase = 1 empresa cadastrada no
 * painel do Brasil NFe) -- ao clonar o projeto para um cliente novo, o
 * unico trabalho aqui e' configurar esses 2 secrets no Supabase daquele
 * cliente, nunca mexer neste arquivo.
 *
 * Fluxo previo (fora do codigo, feito uma vez no painel brasilnfe.com.br):
 * 1. Cadastrar a empresa (POST /AdicionarEmpresa) -- CNPJ, IE, CRT, endereco.
 * 2. Upload do certificado A1 (POST /AlterarCertificado) -- base64 do .pfx + senha.
 * 3. Configurar CSC/ID do CSC de homologacao e producao (Configuracao.NFCe).
 * 4. Copiar o `Token` da empresa retornado -> vira o secret
 *    BRASIL_NFE_TOKEN_EMPRESA aqui.
 */
async function emitirViaBrasilNFe(config: any, nota: any, itens: any[], paymentMethod?: string): Promise<ResultadoEmissao> {
  const userToken = Deno.env.get('BRASIL_NFE_USER_TOKEN');
  const tokenEmpresa = Deno.env.get('BRASIL_NFE_TOKEN_EMPRESA');
  if (!userToken || !tokenEmpresa) {
    return {
      sucesso: false, eContingencia: true,
      motivoRejeicao: 'Brasil NFe nao configurado (BRASIL_NFE_USER_TOKEN ou BRASIL_NFE_TOKEN_EMPRESA ausente)',
    };
  }

  // Ambiente: 1 = producao, 2 = homologacao (nomenclatura da API do
  // Brasil NFe -- NAO confundir com o texto livre 'homologacao'/'producao'
  // ja usado em fiscal_config.ambiente).
  const tipoAmbiente = config.ambiente === 'producao' ? '1' : '2';

  // NFC-e nao tem "cliente" cadastrado de verdade na maioria das vendas de
  // balcao -- ConsumidorFinal:true + CpfCnpj vazio e' o padrao para venda
  // sem identificacao do comprador (a NF-e do Multipedidos confirma isso
  // como comportamento normal do dia a dia da loja).
  const agora = new Date().toISOString();

  const produtos = itens.map((item: any, idx: number) => {
    const precoUnitario = Number(item.price) || 0;
    const qtd = Number(item.quantity) || 1;
    const addonsTotal = (item.selectedAddons || []).reduce(
      (soma: number, a: any) => soma + (Number(a.price) || 0), 0
    );
    const valorTotalItem = Number(((precoUnitario + addonsTotal) * qtd).toFixed(2));

    // CFOP/CSOSN por PRODUTO (achado nos XMLs reais, 21/09/2026: Açai usa
    // ST/CSOSN 500, o resto usa 102 normal) -- cai no padrao da loja
    // (fiscal_config) so' quando o item nao tiver o proprio definido.
    const csosn = item.csosnFiscal || config.csosn_padrao || '102';
    const cfop = Number(item.cfopFiscal || config.cfop_padrao || '5102');

    const imposto: any = {
      PIS: { CodSituacaoTributaria: config.pis_cst || '49', Aliquota: 0, BaseCalculo: 0 },
      COFINS: { CodSituacaoTributaria: config.cofins_cst || '49', Aliquota: 0, BaseCalculo: 0 },
    };
    // ICMSSN500 (Substituicao Tributaria, ICMS ja retido antes -- Açai e
    // bebidas industrializadas) vem com os valores de ST zerados na
    // amostra real (Multipedidos), ver claude-acai.md 21/09/2026.
    if (csosn === '500') {
      imposto.ICMS = { CodSituacaoTributaria: '500', BaseCalculoST: 0, AliquotaST: 0, ValorICMSST: 0 };
    } else {
      imposto.ICMS = { CodSituacaoTributaria: csosn, AliquotaICMS: 0, BaseCalculo: 0, ValorIcms: 0 };
    }

    return {
      NmProduto: item.name || `Item ${idx + 1}`,
      CodProdutoServico: String(item.id ?? idx),
      NCM: item.ncm || '00000000',
      CFOP: cfop,
      UnidadeComercial: item.unidadeFiscal || 'UN',
      UnidadeComercialTributavel: item.unidadeFiscal || 'UN',
      Quantidade: qtd,
      QuantidadeTributavel: qtd,
      ValorUnitario: precoUnitario,
      ValorUnitarioTributavel: precoUnitario,
      ValorTotal: valorTotalItem,
      Imposto: imposto,
    };
  });

  // Forma de pagamento: mapeamento minimo dos metodos que o app ja usa.
  // 01=Dinheiro, 03=Cartao Credito, 04=Cartao Debito, 17=PIX (tabela da
  // Sefaz, confirmada nos XMLs reais do Multipedidos, 21/09/2026).
  const formaPagamentoMap: Record<string, string> = {
    'Dinheiro': '01', 'Cartão': '03', 'Cartao': '03', 'PIX': '17',
  };
  const formaPagamento = formaPagamentoMap[paymentMethod || ''] || '01';

  const payload = {
    Serie: nota.serie,
    Numero: nota.numero,
    ModeloDocumento: 65, // NFC-e
    TipoAmbiente: tipoAmbiente,
    DataEmissao: agora,
    DataEntradaSaida: agora,
    Finalidade: 1, // 1 = NFC-e normal
    NaturezaOperacao: 'Venda de Mercadoria Adquirida ou Recebida de Terceiros',
    IndicadorPresenca: 1, // 1 = operacao presencial
    ConsumidorFinal: true,
    CalcularIBPT: true,
    Cliente: {
      CpfCnpj: '',
      NmCliente: 'CONSUMIDOR FINAL',
      IndicadorIe: 9, // 9 = nao contribuinte
      Endereco: {
        Cep: (config.cep || '').replace(/\D/g, ''),
        Logradouro: config.logradouro || '',
        Numero: config.numero || 'S/N',
        Bairro: config.bairro || '',
        CodMunicipio: config.cod_ibge_municipio || '',
        Municipio: config.municipio || '',
        Uf: config.uf || 'TO',
        CodPais: 1058,
        Pais: 'BRASIL',
      },
    },
    Produtos: produtos,
    Pagamentos: [
      { IndicadorPagamento: 0, Descricao: paymentMethod || 'Dinheiro', FormaPagamento: formaPagamento, VlPago: nota.valor_total },
    ],
    EnviarEmail: false,
  };

  try {
    const resp = await fetch('https://api.brasilnfe.com.br/services/fiscal/EnviarNotaFiscal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'UserToken': userToken,
        'Token': tokenEmpresa,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    // Rede/servico fora do ar (HTTP 5xx ou erro de transporte) -> contingencia,
    // nunca rejeicao definitiva -- a Sefaz pode estar instavel, nao o pedido.
    if (!resp.ok && resp.status >= 500) {
      return { sucesso: false, eContingencia: true, motivoRejeicao: `Brasil NFe indisponivel (HTTP ${resp.status})` };
    }

    const retorno = data?.ReturnNF;
    // cStat 100 = Autorizado (mesmo codigo visto nos 823 XMLs reais do
    // Multipedidos, confirma que e' o codigo de sucesso padrao da Sefaz).
    if (data?.Error) {
      return { sucesso: false, motivoRejeicao: String(data.Error) };
    }
    if (retorno?.Ok && retorno?.CodStatusRespostaSefaz === 100) {
      return {
        sucesso: true,
        chaveAcesso: retorno.ChaveNF,
        protocoloAutorizacao: retorno.NumeroProtocolo,
        xml: data.Base64Xml ? atob(data.Base64Xml) : undefined,
        danfeUrl: data.Base64File ? `data:application/pdf;base64,${data.Base64File}` : undefined,
      };
    }

    // Rejeitado/Denegado pela Sefaz -- precisa correcao manual no cadastro
    // (produto, CFOP, certificado vencido, etc), nao adianta so tentar de novo.
    return {
      sucesso: false,
      motivoRejeicao: retorno?.DsStatusRespostaSefaz || 'Rejeitado pela Sefaz, motivo nao informado',
    };
  } catch (err: any) {
    // Falha de rede/timeout -- contingencia, a venda ja aconteceu.
    return { sucesso: false, eContingencia: true, motivoRejeicao: `Falha ao chamar Brasil NFe: ${err.message}` };
  }
}

/** Roteador: escolhe o adaptador certo a partir de fiscal_config.provedor_api. */
async function emitirNotaFiscal(provedor: string | null | undefined, config: any, nota: any, itens: any[], paymentMethod?: string): Promise<ResultadoEmissao> {
  switch ((provedor || '').toLowerCase()) {
    case 'focus_nfe':
    case 'focusnfe':
      return emitirViaFocusNFe(config, nota, itens);
    case 'enotas':
      return emitirViaENotas(config, nota, itens);
    case 'brasil_nfe':
    case 'brasilnfe':
      return emitirViaBrasilNFe(config, nota, itens, paymentMethod);
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
      .from('orders').select('items, payment_method').eq('id', nota.order_id).maybeSingle();
    const itens = order?.items || [];

    const resultado = await emitirNotaFiscal(config.provedor_api, config, nota, itens, order?.payment_method);

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
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error('[emitir-nfce] Erro:', mensagem);
    return new Response(JSON.stringify({ error: mensagem }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
