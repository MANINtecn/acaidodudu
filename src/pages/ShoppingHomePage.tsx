import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Store as StoreIcon, MapPin, Sun, Moon, ArrowRight, X } from 'lucide-react';
import { fetchLojasShopping, buscarProdutosShopping, type LojaShopping, type ProdutoBusca } from '../services/supabaseService';
import { ImagemProduto } from '../components/ImagemProduto';
import { MARCA } from '../services/marcaService';

type Tema = 'claro' | 'escuro';

// Paleta quente e leve, claro e escuro. As variáveis valem só dentro desta página.
const PALETAS: Record<Tema, React.CSSProperties> = {
    claro: {
        ['--pa-bg' as any]: '#fff8f1', ['--pa-surface' as any]: '#ffffff', ['--pa-soft' as any]: '#ffeedd',
        ['--pa-text' as any]: '#2b1a10', ['--pa-muted' as any]: '#8a6f5c', ['--pa-line' as any]: '#f3dfcd',
        ['--pa-primary' as any]: '#ea580c', ['--pa-primary-2' as any]: '#f59e0b', ['--pa-on-primary' as any]: '#ffffff',
    },
    escuro: {
        ['--pa-bg' as any]: '#17110d', ['--pa-surface' as any]: '#231a14', ['--pa-soft' as any]: '#2e2218',
        ['--pa-text' as any]: '#fdf2e9', ['--pa-muted' as any]: '#c2a591', ['--pa-line' as any]: '#3a2b20',
        ['--pa-primary' as any]: '#fb923c', ['--pa-primary-2' as any]: '#fbbf24', ['--pa-on-primary' as any]: '#2b1a10',
    },
};

const temaInicial = (): Tema => {
    try {
        const salvo = localStorage.getItem('pedeaqui_tema');
        if (salvo === 'claro' || salvo === 'escuro') return salvo;
    } catch (_) { /* sem storage: segue o sistema */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
};

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const Logo: React.FC<{ loja: LojaShopping }> = ({ loja }) => {
    const [falhou, setFalhou] = useState(false);
    if (loja.logo_url && !falhou) {
        return <img src={loja.logo_url} alt="" loading="lazy" decoding="async" onError={() => setFalhou(true)} className="h-14 w-14 rounded-2xl object-cover border border-[var(--pa-line)]" />;
    }
    return (
        <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-black text-[var(--pa-on-primary)] bg-gradient-to-br from-[var(--pa-primary)] to-[var(--pa-primary-2)]">
            {loja.name.trim().charAt(0).toUpperCase()}
        </div>
    );
};

const ShoppingHomePage: React.FC = () => {
    const [tema, setTema] = useState<Tema>(temaInicial);
    const [lojas, setLojas] = useState<LojaShopping[] | null>(null);
    const [erro, setErro] = useState(false);
    const [texto, setTexto] = useState('');
    const [busca, setBusca] = useState('');
    const [aberto, setAberto] = useState(false);
    const [produtos, setProdutos] = useState<ProdutoBusca[]>([]);
    const [categoria, setCategoria] = useState('');
    const [cidade, setCidade] = useState('');
    const caixa = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchLojasShopping().then(setLojas).catch(() => { setErro(true); setLojas([]); });
    }, []);

    useEffect(() => {
        try { localStorage.setItem('pedeaqui_tema', tema); } catch (_) { /* tudo bem */ }
    }, [tema]);

    // Sugestões de produto enquanto digita (espera 300 ms parado para não bombardear o banco).
    useEffect(() => {
        const termo = (aberto ? texto : busca).trim();
        if (termo.length < 2 || !lojas?.length) { setProdutos([]); return; }
        let vivo = true;
        const t = setTimeout(() => {
            buscarProdutosShopping(termo, lojas.map(l => l.id)).then(r => { if (vivo) setProdutos(r); }).catch(() => { if (vivo) setProdutos([]); });
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [texto, busca, aberto, lojas]);

    // Fecha as sugestões ao clicar fora
    useEffect(() => {
        const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, []);

    const categorias = useMemo(() => Array.from(new Set((lojas || []).map(l => l.categoria).filter(Boolean) as string[])).sort(), [lojas]);
    const cidades = useMemo(() => Array.from(new Set((lojas || []).map(l => l.cidade).filter(Boolean) as string[])).sort(), [lojas]);
    const lojaPorId = useMemo(() => new Map((lojas || []).map(l => [l.id, l])), [lojas]);

    const termoAtivo = semAcento(busca.trim());
    const filtradas = useMemo(() => (lojas || []).filter(l =>
        (!categoria || l.categoria === categoria) &&
        (!cidade || l.cidade === cidade) &&
        (!termoAtivo || semAcento(`${l.name} ${l.categoria || ''}`).includes(termoAtivo))
    ), [lojas, categoria, cidade, termoAtivo]);

    const sugestoesLojas = useMemo(() => {
        const t = semAcento(texto.trim());
        return t.length < 2 ? [] : (lojas || []).filter(l => semAcento(l.name).includes(t)).slice(0, 5);
    }, [texto, lojas]);

    const buscar = (e: React.FormEvent) => { e.preventDefault(); setBusca(texto); setAberto(false); };
    const limpar = () => { setTexto(''); setBusca(''); setProdutos([]); };

    const carregando = lojas === null;
    const produtosVisiveis = busca.trim().length >= 2 ? produtos : [];

    return (
        <div style={PALETAS[tema]} className="min-h-screen bg-[var(--pa-bg)] text-[var(--pa-text)]">
            {/* Topo */}
            <header className="sticky top-0 z-30 backdrop-blur bg-[var(--pa-bg)]/85 border-b border-[var(--pa-line)]">
                <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 font-black text-lg tracking-tight">
                        <span className="h-8 w-8 rounded-xl bg-gradient-to-br from-[var(--pa-primary)] to-[var(--pa-primary-2)] text-[var(--pa-on-primary)] flex items-center justify-center"><StoreIcon size={18} /></span>
                        {MARCA.produto}
                    </Link>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setTema(tema === 'claro' ? 'escuro' : 'claro')} aria-label="Alternar tema" className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-[var(--pa-soft)]">
                            {tema === 'claro' ? <Moon size={18} /> : <Sun size={18} />}
                        </button>
                        <Link to="/cadastro" className="text-sm font-bold rounded-full px-4 py-2 bg-[var(--pa-primary)] text-[var(--pa-on-primary)]">Sou lojista</Link>
                    </div>
                </div>
            </header>

            {/* Capa */}
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--pa-soft)] via-[var(--pa-bg)] to-[var(--pa-bg)]" />
                <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-[var(--pa-primary-2)] opacity-20 blur-3xl" />
                <div className="relative mx-auto max-w-5xl px-4 pt-10 pb-10">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--pa-primary)]">Comércio da sua cidade</p>
                    <h1 className="mt-2 text-3xl sm:text-5xl font-black leading-tight">Peça nas lojas<br className="sm:hidden" /> <span className="text-[var(--pa-primary)]">perto de você</span></h1>
                    <p className="mt-3 max-w-xl text-[var(--pa-muted)]">Lanchonetes, sorveterias, restaurantes e mais, todos num só lugar. Escolha a loja, veja o cardápio e peça.</p>

                    <div ref={caixa} className="relative mt-6 max-w-xl">
                        <form onSubmit={buscar} className="flex items-center gap-2 rounded-2xl bg-[var(--pa-surface)] border border-[var(--pa-line)] shadow-lg px-3 py-2">
                            <Search size={20} className="text-[var(--pa-muted)] shrink-0" />
                            <input
                                value={texto}
                                onChange={e => { setTexto(e.target.value); setAberto(true); }}
                                onFocus={() => setAberto(true)}
                                placeholder="Buscar loja ou produto"
                                className="flex-1 bg-transparent outline-none py-1.5 placeholder:text-[var(--pa-muted)]"
                            />
                            {(texto || busca) && <button type="button" onClick={limpar} aria-label="Limpar" className="text-[var(--pa-muted)]"><X size={18} /></button>}
                            <button className="rounded-xl px-4 py-2 text-sm font-bold bg-[var(--pa-primary)] text-[var(--pa-on-primary)]">Buscar</button>
                        </form>

                        {aberto && texto.trim().length >= 2 && (sugestoesLojas.length > 0 || produtos.length > 0) && (
                            <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-[var(--pa-surface)] border border-[var(--pa-line)] shadow-2xl overflow-hidden z-20 max-h-96 overflow-y-auto">
                                {sugestoesLojas.length > 0 && <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--pa-muted)]">Lojas</p>}
                                {sugestoesLojas.map(l => (
                                    <Link key={l.id} to={`/${l.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--pa-soft)]">
                                        <StoreIcon size={16} className="text-[var(--pa-primary)]" /><span className="font-semibold">{l.name}</span>
                                        <span className="ml-auto text-xs text-[var(--pa-muted)]">{l.categoria}</span>
                                    </Link>
                                ))}
                                {produtos.length > 0 && <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--pa-muted)]">Produtos</p>}
                                {produtos.slice(0, 6).map(p => {
                                    const l = lojaPorId.get(p.store_id);
                                    return l ? (
                                        <Link key={`${p.store_id}-${p.id}`} to={`/${l.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--pa-soft)]">
                                            <span className="min-w-0"><span className="block font-semibold truncate">{p.name}</span><span className="block text-xs text-[var(--pa-muted)] truncate">{l.name}</span></span>
                                            <span className="ml-auto font-bold text-[var(--pa-primary)] whitespace-nowrap">{moeda(Number(p.price) || 0)}</span>
                                        </Link>
                                    ) : null;
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <main className="mx-auto max-w-5xl px-4 pt-2 pb-16">
                {/* Filtros */}
                {(categorias.length > 0 || cidades.length > 1) && (
                    <div className="flex flex-wrap items-center gap-2 py-4">
                        <button onClick={() => setCategoria('')} className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${!categoria ? 'bg-[var(--pa-primary)] text-[var(--pa-on-primary)] border-transparent' : 'bg-[var(--pa-surface)] border-[var(--pa-line)]'}`}>Todas</button>
                        {categorias.map(c => (
                            <button key={c} onClick={() => setCategoria(categoria === c ? '' : c)} className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${categoria === c ? 'bg-[var(--pa-primary)] text-[var(--pa-on-primary)] border-transparent' : 'bg-[var(--pa-surface)] border-[var(--pa-line)]'}`}>{c}</button>
                        ))}
                        {cidades.length > 1 && (
                            <label className="ml-auto flex items-center gap-1.5 text-sm text-[var(--pa-muted)]"><MapPin size={16} />
                                <select value={cidade} onChange={e => setCidade(e.target.value)} className="bg-[var(--pa-surface)] border border-[var(--pa-line)] rounded-full px-3 py-1.5 text-[var(--pa-text)]">
                                    <option value="">Todas as cidades</option>
                                    {cidades.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </label>
                        )}
                    </div>
                )}

                {/* Produtos encontrados na busca */}
                {produtosVisiveis.length > 0 && (
                    <section className="mb-8">
                        <h2 className="text-lg font-black mb-3">Produtos para &ldquo;{busca}&rdquo;</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {produtosVisiveis.map(p => {
                                const l = lojaPorId.get(p.store_id);
                                if (!l) return null;
                                return (
                                    <Link key={`${p.store_id}-${p.id}`} to={`/${l.slug}`} className="rounded-2xl bg-[var(--pa-surface)] border border-[var(--pa-line)] overflow-hidden hover:shadow-lg transition-shadow">
                                        <div className="aspect-square bg-[var(--pa-soft)] flex items-center justify-center">
                                            {p.image ? <ImagemProduto src={p.image} alt={p.name} className="h-full w-full object-cover" /> : <StoreIcon className="text-[var(--pa-muted)]" />}
                                        </div>
                                        <div className="p-3">
                                            <p className="font-semibold leading-tight line-clamp-2">{p.name}</p>
                                            <p className="mt-1 font-black text-[var(--pa-primary)]">{moeda(Number(p.price) || 0)}</p>
                                            <p className="text-xs text-[var(--pa-muted)] truncate">{l.name}</p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Lojas */}
                <section>
                    <h2 className="text-lg font-black mb-3">{busca ? 'Lojas encontradas' : 'Lojas'}</h2>
                    {carregando ? (
                        <div className="grid sm:grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-[var(--pa-soft)] animate-pulse" />)}</div>
                    ) : filtradas.length > 0 ? (
                        <div className="grid sm:grid-cols-2 gap-3">
                            {filtradas.map(l => (
                                <Link key={l.id} to={`/${l.slug}`} className="group flex items-center gap-4 rounded-2xl bg-[var(--pa-surface)] border border-[var(--pa-line)] p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all">
                                    <Logo loja={l} />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-black text-lg leading-tight truncate">{l.name}</p>
                                        <p className="text-sm text-[var(--pa-muted)] truncate">{[l.categoria, l.cidade].filter(Boolean).join(' · ') || 'Delivery'}</p>
                                    </div>
                                    <ArrowRight className="text-[var(--pa-primary)] group-hover:translate-x-1 transition-transform" size={20} />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-dashed border-[var(--pa-line)] bg-[var(--pa-surface)] p-8 text-center">
                            <p className="text-lg font-black">{erro ? 'Não foi possível carregar as lojas agora.' : busca || categoria || cidade ? 'Nenhuma loja encontrada.' : 'As primeiras lojas estão chegando.'}</p>
                            <p className="mt-1 text-[var(--pa-muted)]">{erro ? 'Tente de novo em instantes.' : 'Tem um delivery? Seja uma delas.'}</p>
                        </div>
                    )}
                </section>

                {/* Destaque para anunciantes (vira carrossel patrocinado quando houver anunciantes) */}
                <section className="mt-10 rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-[var(--pa-primary)] to-[var(--pa-primary-2)] text-[var(--pa-on-primary)]">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-80">Para lojistas</p>
                    <h2 className="mt-1 text-2xl sm:text-3xl font-black leading-tight">Tem uma lanchonete ou delivery?</h2>
                    <p className="mt-2 max-w-xl opacity-90">Receba pedidos pelo celular e apareça aqui para os clientes da sua cidade. Sem mensalidade: você só paga uma comissão quando vender.</p>
                    <Link to="/cadastro" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--pa-surface)] text-[var(--pa-text)] px-5 py-2.5 font-bold">Cadastrar minha loja <ArrowRight size={18} /></Link>
                </section>
            </main>

            <footer className="border-t border-[var(--pa-line)] py-6 text-center text-xs text-[var(--pa-muted)]">
                {MARCA.produto} &middot; {MARCA.site} &middot; por {MARCA.suporte}
            </footer>
        </div>
    );
};

export default ShoppingHomePage;
