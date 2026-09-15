import { useMemo, useState } from 'react';
import { Printer, Search, Keyboard } from 'lucide-react';
import type { MenuItem, Category } from '../types';

interface ComandosTabProps {
    menuItems: MenuItem[];
    categories: Category[];
}

/** Largura util da bobina 58mm — mesmo valor usado pelo printerService. */
const LARGURA_58MM = 30;

/** Atalhos do sistema. Fonte unica: alimenta a tela E a impressao. */
const ATALHOS: { tecla: string; oque: string }[] = [
    { tecla: 'F4', oque: 'Balcao (lancar)' },
    { tecla: 'F5', oque: 'Pedidos (comandas)' },
    { tecla: 'F6', oque: 'Esta tela' },
    { tecla: 'F7', oque: 'Fechar a comanda aberta' },
    { tecla: '100-941', oque: 'Codigo do produto' },
    { tecla: '1-30', oque: 'Numero da mesa' },
    { tecla: 'R', oque: 'Retirada (sem mesa)' },
    { tecla: 'N', oque: 'Nome do cliente' },
    { tecla: 'ENTER', oque: '1x monta / 2x envia' },
    { tecla: 'ESC', oque: 'Cancela tudo' },
    { tecla: 'D / C / P', oque: 'Dinheiro/Cartao/Pix' },
];

/** Remove acentos: impressora termica costuma trocar acento por lixo. */
const semAcento = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Quebra o texto respeitando a largura da bobina, sem cortar palavra no meio. */
const quebrar = (texto: string, largura: number, recuo = 0): string[] => {
    const palavras = texto.split(' ');
    const linhas: string[] = [];
    let atual = '';
    for (const p of palavras) {
        const teste = atual ? `${atual} ${p}` : p;
        if (teste.length > largura) {
            if (atual) linhas.push(atual);
            atual = ' '.repeat(recuo) + p;
        } else {
            atual = teste;
        }
    }
    if (atual) linhas.push(atual);
    return linhas;
};

export const ComandosTab = ({ menuItems, categories }: ComandosTabProps) => {
    const [busca, setBusca] = useState('');

    // Produtos com codigo, agrupados por categoria e ordenados pelo codigo.
    const grupos = useMemo(() => {
        const comCodigo = menuItems.filter(i => i.codigo != null);
        const porCategoria = categories
            .map(c => ({
                categoria: c.name,
                itens: comCodigo
                    .filter(i => i.categoryId === c.id)
                    .sort((a, b) => (a.codigo || 0) - (b.codigo || 0))
            }))
            .filter(g => g.itens.length > 0);

        if (!busca.trim()) return porCategoria;

        const termo = semAcento(busca.toLowerCase());
        return porCategoria
            .map(g => ({
                ...g,
                itens: g.itens.filter(i =>
                    semAcento(i.name.toLowerCase()).includes(termo) ||
                    String(i.codigo).includes(termo)
                )
            }))
            .filter(g => g.itens.length > 0);
    }, [menuItems, categories, busca]);

    const totalComCodigo = menuItems.filter(i => i.codigo != null).length;

    /**
     * Monta a colinha em texto puro para a bobina de 58mm (30 colunas).
     * Sem cor, sem tabela: so texto monoespacado, que e o que a termica imprime.
     */
    const gerarTexto = (): string => {
        const L: string[] = [];
        const linha = '-'.repeat(LARGURA_58MM);
        const centro = (t: string) => {
            const s = semAcento(t);
            const esq = Math.max(0, Math.floor((LARGURA_58MM - s.length) / 2));
            return ' '.repeat(esq) + s;
        };

        L.push(centro('COLINHA DO BALCAO'));
        L.push(centro('Acai do Dudu'));
        L.push(linha);
        L.push('');
        L.push('ATALHOS');
        L.push(linha);
        ATALHOS.forEach(a => {
            const tecla = semAcento(a.tecla);
            const desc = semAcento(a.oque);
            const espaco = LARGURA_58MM - tecla.length - desc.length;
            L.push(espaco >= 1
                ? tecla + ' '.repeat(espaco) + desc
                : `${tecla}\n  ${desc}`);
        });
        L.push('');
        L.push('FLUXO');
        L.push(linha);
        L.push('LANCAR');
        L.push('401 ENTER  produto no pedido');
        L.push('  3 ENTER  vai p/ mesa 3');
        L.push('        N  nome (opcional)');
        L.push('    ENTER  confirma e envia');
        L.push('');
        L.push('FECHAR CONTA');
        L.push('       F5  aba Pedidos');
        L.push('  3 ENTER  abre a mesa 3');
        L.push('       F7  vai pro checkout');
        L.push('        D  dinheiro (ou C/P)');
        L.push('    ENTER  finaliza');
        L.push('');
        L.push('Pesou na balanca? Digite');
        L.push('direto o numero da mesa.');
        L.push('');
        L.push('CODIGOS');
        L.push(linha);

        grupos.forEach(g => {
            L.push('');
            quebrar(semAcento(g.categoria.toUpperCase()), LARGURA_58MM).forEach(l => L.push(l));
            g.itens.forEach(i => {
                const cod = String(i.codigo).padEnd(4);
                const disp = i.isAvailable === false ? ' (fora)' : '';
                const nome = semAcento(i.name) + disp;
                const linhas = quebrar(nome, LARGURA_58MM - 4, 4);
                L.push(cod + linhas[0]);
                linhas.slice(1).forEach(l => L.push(' '.repeat(4) + l.trim()));
            });
        });

        L.push('');
        L.push(linha);
        L.push('1 bipe = mesa livre');
        L.push('2 bipes = mesa ja ocupada');
        L.push('bipe grave = erro');
        L.push('');
        L.push(centro(new Date().toLocaleDateString('pt-BR')));
        L.push('');
        L.push('');
        return L.join('\n');
    };

    const imprimir = () => {
        const texto = gerarTexto();
        const janela = window.open('', '_blank', 'width=400,height=600');
        if (!janela) {
            alert('Permita janelas pop-up para imprimir a colinha.');
            return;
        }
        janela.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Colinha do Balcao</title>
<style>
  @page { margin: 0; size: 58mm auto; }
  body { margin:0; padding:2mm; width:58mm; background:#fff;
         font-family:'Courier New',Courier,monospace; font-size:11px; line-height:1.25; color:#000; }
  pre { margin:0; white-space:pre-wrap; word-wrap:break-word; }
</style></head><body><pre>${texto.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))}</pre></body></html>`);
        janela.document.close();
        setTimeout(() => { janela.print(); janela.close(); }, 350);
    };

    return (
        <div className="flex flex-col h-full min-h-0 gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Keyboard className="text-red-600" size={26} />
                        Comandos e Códigos
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {totalComCodigo} produtos com código · imprima a colinha para o balcão
                    </p>
                </div>
                <button
                    onClick={imprimir}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                >
                    <Printer size={18} /> Imprimir Colinha (58mm)
                </button>
            </div>

            {/* Atalhos */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {ATALHOS.map(a => (
                    <div key={a.tecla} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 border-l-red-600 rounded-lg px-3 py-2">
                        <span className="block font-mono font-bold text-red-600 dark:text-red-400 text-sm">{a.tecla}</span>
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{a.oque}</span>
                    </div>
                ))}
            </div>

            {/* Busca */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar produto ou código..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-white"
                />
            </div>

            {/* Lista */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {grupos.length === 0 ? (
                    <p className="text-center text-gray-500 py-10">Nenhum produto encontrado.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {grupos.map(g => (
                            <section key={g.categoria} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                                <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-900 dark:text-gray-100 pb-1.5 mb-1.5 border-b-2 border-red-600">
                                    {g.categoria}
                                </h3>
                                <ul className="space-y-0.5">
                                    {g.itens.map(i => (
                                        <li key={i.id} className={`flex gap-2 text-[13px] py-0.5 ${i.isAvailable === false ? 'opacity-50' : ''}`}>
                                            <span className="font-mono font-bold text-red-600 dark:text-red-400 tabular-nums">{i.codigo}</span>
                                            <span className="flex-1 text-gray-700 dark:text-gray-300">
                                                {i.name}
                                                {i.isAvailable === false && (
                                                    <span className="ml-1.5 text-[9px] uppercase border border-current px-1 rounded text-amber-600 dark:text-amber-500">fora</span>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ComandosTab;
