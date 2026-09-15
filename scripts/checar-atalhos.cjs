/**
 * Guarda da Regra 10 (ver claude-acai.md e .claude/skills/atalhos).
 *
 * O listener global de teclado vive fora do ciclo de render: estado lido ali
 * dentro fica um ciclo atrasado. O sintoma e sempre o mesmo — "primeira vez
 * funciona, segunda nao", "minimiza o app e volta, ai funciona".
 *
 * Isto ja aconteceu CINCO vezes (produto duplicado, F4 lento, item avulso,
 * campo de nome duas vezes). Este script quebra o build na sexta.
 *
 * Regra: dentro do handler, estado que decide bloquear tecla vem de REF.
 */
const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', 'src', 'components', 'CounterTab.tsx');

// Estados que silenciam atalho. Dentro do handler, so podem aparecer como ref.
const PROIBIDOS = [
    'nomeAberto',
    'isCustomItemModalOpen',
    'isTableModalOpen',
    'isScaleModalOpen',
    'isCategoryModalOpen',
    'isAddonModalOpen',
];

const fonte = fs.readFileSync(ARQUIVO, 'utf8');
const linhas = fonte.split('\n');

// Delimita o corpo do handler de teclado pelo nivel de chaves.
const inicio = linhas.findIndex(l => /const\s+aoTeclar\s*=\s*\(e:\s*KeyboardEvent\)/.test(l));
if (inicio === -1) {
    console.error('[atalhos] nao achei o handler de teclado no CounterTab.');
    process.exit(1);
}

let profundidade = 0;
let comecou = false;
let fim = linhas.length;
for (let i = inicio; i < linhas.length; i++) {
    for (const ch of linhas[i]) {
        if (ch === '{') { profundidade++; comecou = true; }
        else if (ch === '}') profundidade--;
    }
    if (comecou && profundidade <= 0) { fim = i; break; }
}

const problemas = [];
for (let i = inicio; i <= fim && i < linhas.length; i++) {
    const linha = linhas[i];
    const semComentario = linha.replace(/\/\/.*$/, '');
    for (const nome of PROIBIDOS) {
        // Pega `nomeAberto` cru, mas nao `nomeAbertoRef` nem `setNomeAberto`.
        const cru = new RegExp(`(?<![\\w.])${nome}(?!Ref)(?![\\w])`);
        if (cru.test(semComentario)) {
            problemas.push({ linha: i + 1, nome, texto: linha.trim() });
        }
    }
}

if (problemas.length > 0) {
    console.error('');
    console.error('  REGRA 10 VIOLADA — estado de closure dentro do handler de teclado');
    console.error('');
    for (const p of problemas) {
        console.error(`  CounterTab.tsx:${p.linha}  ${p.nome}`);
        console.error(`     ${p.texto}`);
    }
    console.error('');
    console.error('  Use a REF (ex.: nomeAbertoRef.current), atualizada no corpo do render.');
    console.error('  Senao volta o bug "primeira vez funciona, segunda nao".');
    console.error('');
    process.exit(1);
}

console.log('[atalhos] Regra 10 ok — o handler nao le estado de closure.');
