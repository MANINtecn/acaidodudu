// cadastrar-empresa-brasilnfe -- leva os dados fiscais da loja (fiscal_config)
// e o certificado A1 para o Brasil NFe, pelo proprio app, sem painel.
//
// Acoes (campo `acao` do body):
//   cadastrar (padrao)     AdicionarEmpresa (ou EditarEmpresa) + AlterarCertificado
//   link_ativacao          GerarLinkAtivacao (URL de pagamento da assinatura)
//   verificar_certificado  VerificarCertificado (validade do A1 ja cadastrado)
//
// SEGURANCA
// - O UserToken (chave mestra da conta) e' secret desta funcao
//   (BRASIL_NFE_USER_TOKEN), nunca vai ao app.
// - O Token da empresa fica na tabela `fiscal_credenciais` (sem acesso do
//   app) e NUNCA e' devolvido ao front.
// - CSC e senha do certificado chegam no body, vao ao Brasil NFe e NAO sao
//   gravados em lugar nenhum. O .pfx e' apagado do bucket apos o envio.
// - Os dados da empresa vem SEMPRE do banco, nao do body: quem chama so
//   escolhe a loja, nao consegue cadastrar CNPJ arbitrario.
// Multi-loja: tudo e' por `storeId`; o `CodigoInterno` no Brasil NFe e' o
// proprio storeId, entao o mesmo codigo atende o SaaS depois.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_EMPRESA = 'https://api.brasilnfe.com.br/services/empresa';
const BUCKET_CERT = 'certificados-fiscais';

interface CscAmbiente { id?: string; token?: string }
interface Corpo {
  acao?: 'cadastrar' | 'link_ativacao' | 'verificar_certificado';
  storeId: string;
  senhaCertificado?: string;
  csc?: { producao?: CscAmbiente; homologacao?: CscAmbiente };
}

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const soDigitos = (v?: string | null) => (v || '').replace(/\D/g, '');

async function chamarBrasilNFe(caminho: string, userToken: string, tokenEmpresa: string | null, corpo?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'UserToken': userToken };
  if (tokenEmpresa) headers['Token'] = tokenEmpresa;
  const resp = await fetch(`${API_EMPRESA}/${caminho}`, {
    method: 'POST',
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resp.text();
  let data: any = null;
  try { data = JSON.parse(texto); } catch (_e) { /* resposta em texto puro */ }
  return { ok: resp.ok, httpStatus: resp.status, data, texto };
}

/** IdCSC tem 6 digitos no layout da NFC-e. */
const normalizarIdCsc = (id: string) => (/^\d+$/.test(id) ? id.padStart(6, '0') : id);

function montarConfiguracaoNFCe(csc: Corpo['csc']): Record<string, string> {
  const nfce: Record<string, string> = {};
  const prod = csc?.producao;
  const hom = csc?.homologacao;
  if (prod?.id?.trim() && prod?.token?.trim()) {
    nfce.IdCSCProducao = normalizarIdCsc(prod.id.trim());
    nfce.CSCProducao = prod.token.trim();
  }
  if (hom?.id?.trim() && hom?.token?.trim()) {
    nfce.IdCSCHomologacao = normalizarIdCsc(hom.id.trim());
    nfce.CSCHomologacao = hom.token.trim();
  }
  return nfce;
}

function validarConfig(config: any): string[] {
  const faltando: string[] = [];
  if (soDigitos(config.cnpj).length !== 14) faltando.push('CNPJ (14 dígitos)');
  if (!soDigitos(config.inscricao_estadual)) faltando.push('Inscrição Estadual');
  if (!config.razao_social?.trim()) faltando.push('Razão Social');
  if (!config.logradouro?.trim()) faltando.push('Logradouro');
  if (!config.bairro?.trim()) faltando.push('Bairro');
  if (!config.municipio?.trim()) faltando.push('Município');
  if (soDigitos(config.cod_ibge_municipio).length !== 7) faltando.push('Código IBGE do município (7 dígitos)');
  if (soDigitos(config.cep).length !== 8) faltando.push('CEP (8 dígitos)');
  return faltando;
}

function montarEmpresa(config: any, storeId: string, configuracaoNFCe: Record<string, string>) {
  const empresa: Record<string, unknown> = {
    CNPJ: soDigitos(config.cnpj),
    CodigoInterno: storeId,
    NmFantasia: config.nome_fantasia?.trim() || config.razao_social.trim(),
    RzSocial: config.razao_social.trim(),
    IE: soDigitos(config.inscricao_estadual),
    CRT: Number(config.regime_tributario) || 1,
    Endereco: {
      Cep: soDigitos(config.cep),
      Logradouro: config.logradouro.trim(),
      Complemento: config.complemento?.trim() || undefined,
      Numero: config.numero?.trim() || 'S/N',
      Bairro: config.bairro.trim(),
      CodMunicipio: soDigitos(config.cod_ibge_municipio),
      Municipio: config.municipio.trim(),
      Uf: (config.uf || 'TO').toUpperCase(),
      CodPais: 1058,
      Pais: 'Brasil',
    },
  };
  if (config.inscricao_municipal?.trim()) empresa.IM = config.inscricao_municipal.trim();
  if (soDigitos(config.cnae)) empresa.CNAE = soDigitos(config.cnae);
  const contato: Record<string, string> = {};
  if (soDigitos(config.telefone)) contato.Telefone = soDigitos(config.telefone);
  if (config.email?.trim()) contato.Email = config.email.trim();
  if (Object.keys(contato).length) empresa.Contato = contato;
  if (Object.keys(configuracaoNFCe).length) empresa.Configuracao = { NFCe: configuracaoNFCe };
  return empresa;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const userToken = Deno.env.get('BRASIL_NFE_USER_TOKEN');
  if (!userToken) {
    return responder({ ok: false, erro: 'Servidor sem BRASIL_NFE_USER_TOKEN configurado (secret da Edge Function).' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const corpo: Corpo = await req.json();
    const { storeId } = corpo;
    const acao = corpo.acao || 'cadastrar';
    if (!storeId) return responder({ ok: false, erro: 'storeId é obrigatório.' }, 400);

    const { data: config, error: configErr } = await supabase
      .from('fiscal_config').select('*').eq('store_id', storeId).maybeSingle();
    if (configErr) throw configErr;
    if (!config) return responder({ ok: false, erro: 'Salve os dados fiscais da loja antes de cadastrar.' });
    if (config.provedor_api !== 'brasil_nfe') {
      return responder({ ok: false, erro: "Selecione 'Brasil NFe' como provedor e salve antes." });
    }

    const { data: cred } = await supabase
      .from('fiscal_credenciais').select('brasilnfe_token_empresa').eq('store_id', storeId).maybeSingle();
    let tokenEmpresa: string | null = cred?.brasilnfe_token_empresa || null;

    const salvarToken = async (token: string) => {
      const { error } = await supabase.from('fiscal_credenciais').upsert(
        { store_id: storeId, brasilnfe_token_empresa: token, updated_at: new Date().toISOString() },
        { onConflict: 'store_id' },
      );
      if (error) throw error;
    };

    // ---------- link de ativacao ----------
    if (acao === 'link_ativacao') {
      if (!tokenEmpresa) return responder({ ok: false, erro: 'Empresa ainda não cadastrada no Brasil NFe.' });
      const r = await chamarBrasilNFe('GerarLinkAtivacao', userToken, tokenEmpresa);
      const url = typeof r.data === 'string' ? r.data : r.texto.trim().replace(/^"|"$/g, '');
      if (!r.ok || !/^https?:\/\//i.test(url)) {
        return responder({ ok: false, erro: `Não foi possível gerar o link (HTTP ${r.httpStatus}): ${r.texto.slice(0, 200)}` });
      }
      return responder({ ok: true, url });
    }

    // ---------- verificar certificado ----------
    if (acao === 'verificar_certificado') {
      if (!tokenEmpresa) return responder({ ok: false, erro: 'Empresa ainda não cadastrada no Brasil NFe.' });
      const r = await chamarBrasilNFe('VerificarCertificado', userToken, tokenEmpresa, { Interno: true });
      if (!r.ok || r.data?.status !== 1) {
        return responder({ ok: false, erro: r.data?.Error || `Falha ao verificar (HTTP ${r.httpStatus}).` });
      }
      if (r.data.DtExpiracao) {
        await supabase.from('fiscal_config')
          .update({ certificado_validade: String(r.data.DtExpiracao).slice(0, 10) }).eq('store_id', storeId);
      }
      return responder({ ok: true, expirado: !!r.data.Expirado, dtExpiracao: r.data.DtExpiracao, avisos: r.data.Avisos || [] });
    }

    // ---------- cadastrar / atualizar ----------
    const faltando = validarConfig(config);
    if (faltando.length) return responder({ ok: false, erro: `Faltam dados: ${faltando.join(', ')}.` });

    const configuracaoNFCe = montarConfiguracaoNFCe(corpo.csc);
    const etapas: string[] = [];
    const avisos: string[] = [];

    // Empresa ja cadastrada antes (ex.: pelo painel)? Adota o token dela em vez de duplicar.
    if (!tokenEmpresa) {
      const todas = await chamarBrasilNFe('BuscarTodasEmpresas', userToken, null);
      if (Array.isArray(todas.data)) {
        const achada = todas.data.find((e: any) => soDigitos(e?.CNPJ) === soDigitos(config.cnpj));
        if (achada?.Token) {
          tokenEmpresa = String(achada.Token);
          await salvarToken(tokenEmpresa);
          etapas.push('Empresa já existia no Brasil NFe — vinculada.');
        }
      }
    }

    if (!tokenEmpresa) {
      if (!Object.keys(configuracaoNFCe).length) {
        avisos.push('Cadastro feito sem CSC: informe o CSC e reenvie antes de emitir notas.');
      }
      const r = await chamarBrasilNFe('AdicionarEmpresa', userToken, null, montarEmpresa(config, storeId, configuracaoNFCe));
      if (!r.ok || r.data?.status !== true || !r.data?.token) {
        return responder({ ok: false, erro: r.data?.Error || `Brasil NFe recusou o cadastro (HTTP ${r.httpStatus}): ${r.texto.slice(0, 300)}` });
      }
      tokenEmpresa = String(r.data.token);
      // Guarda o token ANTES do certificado: se a proxima etapa falhar, a
      // empresa ja existe la e a nova tentativa cai no fluxo de atualizacao.
      await salvarToken(tokenEmpresa);
      etapas.push('Empresa cadastrada no Brasil NFe.');
      for (const a of r.data.Avisos || []) avisos.push(String(a));
    } else if (Object.keys(configuracaoNFCe).length) {
      // Atualizacao: so reenvia os dados quando o CSC veio junto, porque nao
      // ha garantia de que a edicao preserve o CSC se ele for omitido.
      const r = await chamarBrasilNFe('EditarEmpresa', userToken, tokenEmpresa, montarEmpresa(config, storeId, configuracaoNFCe));
      if (!r.ok || r.data?.status !== true) {
        return responder({ ok: false, erro: r.data?.Error || `Brasil NFe recusou a atualização (HTTP ${r.httpStatus}): ${r.texto.slice(0, 300)}` });
      }
      etapas.push('Dados da empresa atualizados no Brasil NFe.');
      for (const a of r.data.Avisos || []) avisos.push(String(a));
    } else {
      avisos.push('Dados cadastrais não reenviados: digite o CSC para atualizar o cadastro.');
    }

    // Certificado A1: so quando ha arquivo enviado E a senha veio agora.
    let certificadoValidade: string | null = null;
    const caminhoCert: string | null = config.certificado_storage_path || null;
    if (caminhoCert && corpo.senhaCertificado) {
      const baixado = await supabase.storage.from(BUCKET_CERT).download(caminhoCert);
      if (baixado.error || !baixado.data) {
        return responder({ ok: false, etapas, erro: `Não consegui ler o certificado enviado: ${baixado.error?.message || 'arquivo ausente'}. Envie o .pfx de novo.` });
      }
      const r = await chamarBrasilNFe('AlterarCertificado', userToken, tokenEmpresa, {
        Senha: corpo.senhaCertificado,
        Base64CertificateFile: base64Encode(await baixado.data.arrayBuffer()),
      });
      if (!r.ok || r.data?.status !== 1) {
        return responder({ ok: false, etapas, erro: `Certificado recusado: ${r.data?.Error || `HTTP ${r.httpStatus}`}` });
      }
      certificadoValidade = r.data.DtExpiracao ? String(r.data.DtExpiracao).slice(0, 10) : null;
      etapas.push('Certificado A1 enviado ao Brasil NFe.');
      if (r.data.Expirado) avisos.push('Atenção: o Brasil NFe informa que este certificado está EXPIRADO.');
      for (const a of r.data.Avisos || []) avisos.push(String(a));
      // O Brasil NFe ja guarda o certificado: nao deixa o .pfx parado no nosso bucket.
      await supabase.storage.from(BUCKET_CERT).remove([caminhoCert]);
    } else if (!caminhoCert) {
      avisos.push('Certificado ainda não enviado: envie o .pfx e a senha para emitir notas.');
    } else {
      avisos.push('Certificado não reenviado: informe a senha para enviá-lo.');
    }

    const atualizacao: Record<string, unknown> = {
      brasilnfe_cadastrada_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (certificadoValidade) {
      atualizacao.certificado_validade = certificadoValidade;
      atualizacao.certificado_storage_path = null;
    }
    // CSC foi enviado ao Brasil NFe: limpa qualquer copia legada no banco.
    if (Object.keys(configuracaoNFCe).length) atualizacao.csc_token = null;
    await supabase.from('fiscal_config').update(atualizacao).eq('store_id', storeId);

    return responder({ ok: true, etapas, avisos, certificadoValidade });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error('[cadastrar-empresa-brasilnfe] Erro:', mensagem);
    return responder({ ok: false, erro: mensagem }, 500);
  }
});
