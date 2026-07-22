import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const url = 'https://sapcasskdnxgqadgrqwy.supabase.co';
const serviceKey = 'sb_secret_H8_8dZWpvbctjcWwL5WwFQ_8cAFrhOD';

const supabase = createClient(url, serviceKey);

async function importJson() {
  const jsonPath = path.resolve('produtos_acai_do_dudu.json');
  if (!fs.existsSync(jsonPath)) {
    console.error("Arquivo 'produtos_acai_do_dudu.json' não encontrado na raiz do projeto!");
    return;
  }

  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const items = JSON.parse(rawData);

  console.log(`Carregados ${items.length} itens do arquivo JSON.`);

  // Find store_id
  const { data: stores } = await supabase.from('stores').select('id').eq('slug', 'acaidodudu');
  if (!stores || !stores[0]) {
    console.error("Loja 'acaidodudu' não encontrada no banco!");
    return;
  }
  const storeId = stores[0].id;

  // Group by category
  const categoriesMap = {};
  for (const item of items) {
    const catName = item.category || item.categoria || 'Geral';
    if (!categoriesMap[catName]) {
      const { data: newCat } = await supabase.from('categories').insert([{ name: catName, store_id: storeId }]).select();
      if (newCat && newCat[0]) {
        categoriesMap[catName] = newCat[0].id;
        console.log(`Categoria criada: '${catName}' (ID: ${newCat[0].id})`);
      }
    }
  }

  // Insert Menu Items
  for (const item of items) {
    const catName = item.category || item.categoria || 'Geral';
    const catId = categoriesMap[catName] || null;

    const priceNum = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || item.preco).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

    await supabase.from('menu_items').insert([{
      store_id: storeId,
      category_id: catId,
      name: item.name || item.nome,
      description: item.description || item.descricao || '',
      price: priceNum,
      image: item.image || item.imagem || item.foto || null,
      is_available: true,
      allowed_addons: item.addons || item.adicionais || []
    }]);
    console.log(`Produto importado: ${item.name || item.nome} - R$ ${priceNum}`);
  }

  console.log("=== IMPORTAÇÃO DO CARDÁPIO DE AÇAÍ CONCLUÍDA COM SUCESSO! ===");
}

importJson();
