
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env manually
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
    console.log("Loading .env file...");
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            process.env[key] = value;
        }
    });
} else {
    console.warn(".env file not found");
}

async function run() {
    console.log("Importing supabaseService...");
    const { createOrder, supabase } = await import('./src/services/supabaseService');

    const testPhone = '32999999999';
    
    const { data: storeData } = await supabase.from('stores').select('id').limit(1).single();
    const storeId = storeData?.id;

    if (!storeId) {
        console.error("No store found");
        return;
    }

    console.log(`Using Store ID: ${storeId}`);

    // Create 11 orders (enough for 10 stamps + 1 extra)
    for (let i = 0; i < 11; i++) {
         const order = {
            dailyOrderNumber: 6000 + i,
            customerName: 'Loyalty Tester Adjusted',
            phone: testPhone,
            address: 'Rua Teste Loyalty, 100',
            referencePoint: 'Lab',
            orderType: 'Entrega',
            paymentMethod: 'Dinheiro',
            status: 'Entregue', 
            items: [{
                name: 'Item Teste Fidelidade',
                price: 40.00, 
                quantity: 1,
                selectedAddons: [],
                eligibleForCombo: false,
                isCombo: false,
                cartId: `test-${i}`,
                categoryId: 1,
                store_id: storeId,
                isAvailable: true,
                notes: ''
            }],
            total: 40.00,
            store_id: storeId,
            deliveryFee: 0,
            changeFor: '50',
            printed: false
        };
        
        try {
            await createOrder(order);
            console.log(`Created order ${i+1}/11`);
        } catch(e) {
            console.error(`Error creating order ${i}:`, e);
        }
    }
    
    // Verify Customer
    const { data: customer } = await supabase.from('customers').select('*').eq('phone', testPhone).eq('store_id', storeId).single();
    if (customer) {
        console.log("Customer confirmed in DB:", customer.name, customer.phone);
    } else {
        console.error("Customer NOT found in DB even after creating orders!");
    }

    console.log("Done creating 11 orders for loyalty test.");
}

run();
