const fs = require('fs');

const report = fs.readFileSync('firebase_check_report.txt', 'utf8');
const lines = report.split('\n');

let currentTable = '';
let currentId = '';
const updates = [];

for (const line of lines) {
    const tableMatch = line.match(/\[EXISTE\] Tabela: (\w+), ID: ([\w-]+)/);
    if (tableMatch) {
        currentTable = tableMatch[1];
        currentId = tableMatch[2];
        continue;
    }

    const urlMatch = line.match(/Firebase URL: (https:\/\/firebasestorage\.googleapis\.com\/.*)/);
    if (urlMatch && currentTable && currentId) {
        const url = urlMatch[1].trim();
        if (currentTable === 'stores') {
            updates.push(`UPDATE stores SET logo_url = '${url}' WHERE id = '${currentId}';`);
        } else if (currentTable === 'menu_items') {
            updates.push(`UPDATE menu_items SET image = '${url}' WHERE id = ${currentId};`);
        }
        currentTable = '';
        currentId = '';
    }
}

console.log('-- SCRIPT DE ATUALIZAÇÃO: SUPABASE -> FIREBASE');
console.log('-- Gerado a partir de firebase_check_report.txt\n');
updates.forEach(u => console.log(u));
console.log("\nNOTIFY pgrst, 'reload schema';");
