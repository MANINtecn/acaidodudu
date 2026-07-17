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
    const { fetchCustomerByPhone, fetchLastOrderByPhone, supabase } = await import('./src/services/supabaseService');

    console.log("Testing Customer Recognition...");

    // 1. Fetch a store to get storeId
    const { data: stores } = await supabase.from('stores').select('id, slug').limit(1);
    if (!stores || stores.length === 0) {
        console.error("No stores found.");
        return;
    }
    const storeId = stores[0].id;
    console.log(`Using Store: ${stores[0].slug} (${storeId})`);

    // 2. Create a test customer if not exists
    const testPhone = '5511999999999';
    const { data: existingCustomer } = await supabase.from('customers').select('*').eq('phone', testPhone).eq('store_id', storeId).single();

    if (!existingCustomer) {
        console.log("Creating test customer...");
        const { error } = await supabase.from('customers').insert({
            phone: testPhone,
            name: 'Test User',
            address: 'Rua Teste, 123',
            reference_point: 'Perto da padaria',
            store_id: storeId
        });
        if (error) console.error("Error creating customer:", error);
    } else {
        console.log("Test customer already exists.");
    }

    // 3. Test fetchCustomerByPhone
    console.log("Fetching customer by phone...");
    const customer = await fetchCustomerByPhone(testPhone, storeId);
    console.log("Customer result:", customer ? "Found" : "Not Found");
    if (customer) {
        console.log(`Name: ${customer.name}, Phone: ${customer.phone}`);
    }

    // 4. Test fetchLastOrderByPhone
    console.log("Fetching last order...");
    const lastOrder = await fetchLastOrderByPhone(testPhone, storeId);
    console.log("Last Order result:", lastOrder ? "Found" : "Not Found");
    if (lastOrder) {
        console.log(`Order ID: ${lastOrder.id}, Total: ${lastOrder.total}`);
    } else {
        console.log("No last order found (expected if new customer).");
    }
}

run();
