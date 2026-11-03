import React, { useRef, useState } from 'react';
import { ImagePlus, RotateCcw, Save } from 'lucide-react';
import { ICONE_PADRAO, MARCA_PADRAO, enviarLogoDaPlataforma, salvarMarca, textoSobre, useMarca, type MarcaPlataforma } from '../../services/marcaPlataforma';

const Cor: React.FC<{ rotulo: string; dica: string; valor: string; onChange: (v: string) => void }> = ({ rotulo, dica, valor, onChange }) => (
    <div>
        <p className="text-sm font-bold text-gray-200">{rotulo}</p>
        <p className="text-xs text-gray-500 mb-2">{dica}</p>
        <div className="flex items-center gap-3">
            <input type="color" value={valor} onChange={e => onChange(e.target.value)} className="h-11 w-16 cursor-pointer rounded-lg border border-gray-600 bg-gray-700 p-1" />
            <input value={valor} onChange={e => onChange(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} maxLength={7} spellCheck={false} className="w-28 rounded-lg border border-gray-600 bg-gray-700 p-2 font-mono text-sm uppercase text-white" />
        </div>
    </div>
);

export const MarcaSecao: React.FC = () => {
    const salva = useMarca();
    const [rascunho, setRascunho] = useState<MarcaPlataforma>(salva);
    const [enviando, setEnviando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
    const entrada = useRef<HTMLInputElement>(null);

    const corValida = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
    const mudou = JSON.stringify(rascunho) !== JSON.stringify(salva);
    const icone = rascunho.logo_url || ICONE_PADRAO;

    const escolherLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const arquivo = e.target.files?.[0];
        e.target.value = '';
        if (!arquivo) return;
        setMsg(null);
        setEnviando(true);
        try {
            const url = await enviarLogoDaPlataforma(arquivo);
            setRascunho(r => ({ ...r, logo_url: url }));
            setMsg({ tipo: 'ok', texto: 'Logo enviada. Confira a prévia e clique em Salvar.' });
        } catch (err: any) {
            setMsg({ tipo: 'erro', texto: `Não foi possível enviar a logo: ${err?.message || err}` });
        } finally {
            setEnviando(false);
        }
    };

    const salvar = async () => {
        setMsg(null);
        if (!corValida(rascunho.cor_primaria) || !corValida(rascunho.cor_secundaria)) return setMsg({ tipo: 'erro', texto: 'Use cores no formato #RRGGBB.' });
        if (!rascunho.nome.trim()) return setMsg({ tipo: 'erro', texto: 'Informe o nome da plataforma.' });
        setSalvando(true);
        try {
            await salvarMarca({ ...rascunho, nome: rascunho.nome.trim() });
            setMsg({ tipo: 'ok', texto: 'Marca salva. Já vale para o site inteiro (abas abertas atualizam ao recarregar).' });
        } catch (err: any) {
            setMsg({ tipo: 'erro', texto: `Não foi possível salvar: ${err?.message || err}. Se a tabela plataforma_marca ainda não existe, rode o SQL 13.` });
        } finally {
            setSalvando(false);
        }
    };

    const gradiente = `linear-gradient(135deg, ${corValida(rascunho.cor_primaria) ? rascunho.cor_primaria : MARCA_PADRAO.cor_primaria}, ${corValida(rascunho.cor_secundaria) ? rascunho.cor_secundaria : MARCA_PADRAO.cor_secundaria})`;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Marca</h1>
                <p className="text-sm text-gray-400 mt-1">A logo e as cores do Pede Aqui. Aparecem no shopping, na aba do navegador das telas da plataforma e no app instalado quando a loja não tem logo própria. Cada loja continua com a logo dela.</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-6 bg-gray-800 rounded-xl border border-gray-700 p-5">
                    <div>
                        <p className="text-sm font-bold text-gray-200">Nome</p>
                        <input value={rascunho.nome} onChange={e => setRascunho({ ...rascunho, nome: e.target.value })} maxLength={40} className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 p-2.5 text-white" />
                    </div>

                    <div>
                        <p className="text-sm font-bold text-gray-200">Logo</p>
                        <p className="text-xs text-gray-500 mb-2">PNG, JPG ou WebP, de preferência quadrada e com fundo transparente. Vira 512 por 512.</p>
                        <div className="flex items-center gap-4">
                            <div className="h-20 w-20 rounded-2xl border border-gray-600 bg-[repeating-conic-gradient(#374151_0%_25%,#1f2937_0%_50%)] bg-[length:16px_16px] flex items-center justify-center overflow-hidden">
                                <img src={icone} alt="Logo" className="h-full w-full object-contain" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <button type="button" disabled={enviando} onClick={() => entrada.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-bold text-white"><ImagePlus size={16} /> {enviando ? 'Enviando...' : rascunho.logo_url ? 'Trocar logo' : 'Subir logo'}</button>
                                {rascunho.logo_url && <button type="button" onClick={() => setRascunho({ ...rascunho, logo_url: null })} className="text-xs text-gray-400 hover:text-white text-left">Remover (volta ao ícone provisório)</button>}
                            </div>
                            <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={escolherLogo} />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-6">
                        <Cor rotulo="Cor principal" dica="Botões, destaques e barra do navegador no celular." valor={rascunho.cor_primaria} onChange={v => setRascunho({ ...rascunho, cor_primaria: v })} />
                        <Cor rotulo="Cor secundária" dica="Segunda cor do degradê e dos detalhes." valor={rascunho.cor_secundaria} onChange={v => setRascunho({ ...rascunho, cor_secundaria: v })} />
                    </div>

                    {msg && <p className={`text-sm ${msg.tipo === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{msg.texto}</p>}

                    <div className="flex flex-wrap gap-3">
                        <button type="button" disabled={salvando || !mudou} onClick={salvar} className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 px-5 py-2.5 text-sm font-bold text-white"><Save size={16} /> {salvando ? 'Salvando...' : 'Salvar'}</button>
                        <button type="button" onClick={() => setRascunho(MARCA_PADRAO)} className="inline-flex items-center gap-2 rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-bold text-gray-300 hover:bg-gray-700"><RotateCcw size={16} /> Restaurar padrão</button>
                    </div>
                </div>

                <div className="space-y-4">
                    <p className="text-sm font-bold text-gray-200">Prévia</p>
                    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                        <p className="text-xs text-gray-500 mb-2">Aba do navegador</p>
                        <div className="inline-flex items-center gap-2 rounded-t-lg bg-gray-700 px-3 py-2 text-xs text-gray-100">
                            <img src={icone} alt="" className="h-4 w-4 object-contain" /> {rascunho.nome.toUpperCase() || 'PEDE AQUI'}
                        </div>
                    </div>
                    <div className="rounded-xl border border-gray-700 bg-white p-4 text-gray-900">
                        <p className="text-xs text-gray-500 mb-3">Topo do shopping</p>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 font-black text-lg">
                                <span className="h-8 w-8 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: rascunho.logo_url ? 'transparent' : gradiente }}><img src={icone} alt="" className="h-full w-full object-contain" /></span>
                                {rascunho.nome || 'Pede Aqui'}
                            </span>
                            <span className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: corValida(rascunho.cor_primaria) ? rascunho.cor_primaria : MARCA_PADRAO.cor_primaria, color: textoSobre(rascunho.cor_primaria) }}>Sou lojista</span>
                        </div>
                        <div className="mt-4 h-3 rounded-full" style={{ background: gradiente }} />
                    </div>
                    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 flex items-center gap-4">
                        <div className="h-16 w-16 rounded-2xl overflow-hidden bg-white flex items-center justify-center shadow"><img src={icone} alt="" className="h-full w-full object-contain" /></div>
                        <div>
                            <p className="text-sm font-bold text-gray-200">Ícone no celular</p>
                            <p className="text-xs text-gray-500">Como aparece na tela inicial de quem instala o app de uma loja sem logo.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
