/**
 * Pedido de TESTE — envia um pedido igual ao que vem do link do cliente.
 *
 *   node claude-pedido-teste.cjs              -> ENTREGA (padrao)
 *   node claude-pedido-teste.cjs --retirada   -> Retirada (coluna Balcao)
 *   node claude-pedido-teste.cjs --mesa 3     -> Mesa 3
 *   node claude-pedido-teste.cjs --conferir   -> so confere as reservas do ultimo
 *   node claude-pedido-teste.cjs --limpar     -> apaga os pedidos de teste
 *
 * Sempre em nome de TECX SISTEMAS e com origin WEB, para cair no filtro
 * "So pedidos do app" da cozinha.
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ARQ_ULTIMO = '.claude-ultimo-teste';
const args = process.argv.slice(2);

async function lojaId() {
  const { data } = await db.from('stores').select('id').limit(1);
  return data?.[0]?.id;
}

async function enviar() {
  const STORE = await lojaId();
  if (!STORE) return console.log('❌ Nenhuma loja encontrada.');

  // Pega 2 produtos disponiveis de verdade
  const { data: prods } = await db
    .from('menu_items').select('id,name,price,codigo')
    .eq('is_available', true).gt('price', 0).limit(2);

  if (!prods?.length) return console.log('❌ Nenhum produto disponivel.');

  const itens = prods.map((p, n) => ({
    id: p.id, name: p.name, price: Number(p.price), quantity: 1,
    selectedAddons: [], notes: n === 0 ? 'PEDIDO DE TESTE' : '',
    cartId: `teste-${n}`, categoryId: 0, description: '',
    isCombo: false, eligibleForCombo: false,
    store_id: STORE, isAvailable: true, printed: false,
  }));

  // Tipo do pedido. O AdminPage separa as colunas por order_type === 'Entrega',
  // entao "Retirada" e "Balcao" caem ambos na coluna Balcao/Retirada.
  const iMesa = args.indexOf('--mesa');
  const mesa = iMesa >= 0 ? parseInt(args[iMesa + 1], 10) : null;
  const tipo = mesa ? 'Balcão' : args.includes('--retirada') ? 'Retirada' : 'Entrega';

  // Taxa de entrega real da loja, para o total bater com o que o cliente veria.
  let taxa = 0;
  if (tipo === 'Entrega') {
    const { data: cfg } = await db.from('settings').select('delivery_fee').limit(1);
    taxa = Number(cfg?.[0]?.delivery_fee) || 0;
  }

  const subtotal = itens.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = subtotal + taxa;
  const agora = new Date().toISOString();

  const { data, error } = await db.from('orders').insert({
    timestamp: agora,
    daily_order_number: 0,              // trigger do banco numera
    customer_name: 'TECX SISTEMAS',
    phone: '63999999999',
    address: tipo === 'Entrega' ? 'RUA DE TESTE, 123 - Centro' : 'PEDIDO DE TESTE',
    reference_point: 'Teste de impressao',
    order_type: tipo,
    table_number: mesa || undefined,
    comanda_number: mesa || undefined,
    payment_method: 'PIX',
    status: 'Novo',
    items: itens,
    total,
    store_id: STORE,
    printed: false,
    observation: 'TESTE TECX SISTEMAS - conferir se sai 1 via so',
    delivery_fee: taxa,
    origin: 'WEB',                      // o filtro "So pedidos do app" aceita
    status_history: [{ status: 'Novo', timestamp: agora }],
  }).select('id,daily_order_number,customer_name,total').single();

  if (error) return console.log('❌', error.message);

  fs.writeFileSync(ARQ_ULTIMO, data.id, 'utf8');

  console.log('✅ PEDIDO ENVIADO');
  console.log(`   #${data.daily_order_number} | ${data.customer_name} | R$ ${Number(data.total).toFixed(2)}`);
  console.log(`   tipo: ${tipo}${mesa ? ' (mesa ' + mesa + ')' : ''}${taxa ? ' | taxa R$ ' + taxa.toFixed(2) : ''}`);
  console.log(`   coluna: ${tipo === 'Entrega' ? 'ENTREGA' : 'BALCAO / RETIRADA'}`);
  itens.forEach(i => console.log(`     - ${i.name}  R$ ${i.price.toFixed(2)}`));
  console.log(`   id: ${data.id}`);
  console.log('');
  console.log('   COZINHA (So pedidos do app) -> deve imprimir');
  console.log('   SALAO   (Nao imprimir)      -> nao deve imprimir');
  console.log('');
  console.log('   Conferir em ~10s:  node claude-pedido-teste.cjs --conferir');
}

async function conferir() {
  let id;
  try { id = fs.readFileSync(ARQ_ULTIMO, 'utf8').trim(); } catch { }
  if (!id) return console.log('(nenhum pedido de teste registrado ainda)');

  const { data: imp } = await db
    .from('impressoes').select('estacao,tipo_via,impresso_em').eq('order_id', id);
  const { data: o } = await db
    .from('orders').select('daily_order_number,printed').eq('id', id).single();

  console.log(`=== PEDIDO #${o?.daily_order_number ?? '?'} ===`);
  console.log('Marcado como impresso:', o?.printed ? 'SIM' : 'nao');
  console.log('');
  console.log('Reservas de impressao:', imp?.length || 0);
  (imp || []).forEach(r =>
    console.log(`  ${r.estacao} / ${r.tipo_via}  as ${new Date(r.impresso_em).toLocaleTimeString('pt-BR')}`));

  const principais = (imp || []).filter(r => r.tipo_via === 'principal');
  console.log('');
  if (principais.length === 0) console.log('⚠️  Ninguem imprimiu ainda.');
  else if (principais.length === 1) console.log('✅ UMA via — a trava funcionou.');
  else console.log(`❌ ${principais.length} vias — investigar.`);
}

async function limpar() {
  const { data } = await db.from('orders').select('id')
    .eq('customer_name', 'TECX SISTEMAS');
  if (!data?.length) return console.log('(nenhum pedido de teste para apagar)');
  await db.from('orders').delete().eq('customer_name', 'TECX SISTEMAS');
  console.log(`🗑️  ${data.length} pedido(s) de teste apagado(s).`);
  try { fs.unlinkSync(ARQ_ULTIMO); } catch { }
}

(async () => {
  if (args.includes('--conferir')) return conferir();
  if (args.includes('--limpar')) return limpar();
  await enviar();
})();
