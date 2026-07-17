
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};

envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        envVars[key.trim()] = value.trim();
    }
});

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env file');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
    const phone = '32999999999';
    console.log(`Checking for customer with phone ${phone}...`);
    
    const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone);

    if (error) {
        console.error("Error fetching customer:", error);
        return;
    }

    if (!customers || customers.length === 0) {
        console.log("No customer found with that phone.");
        return;
    }

    const customer = customers[0];
    console.log(`Customer Found: ${customer.name} (ID: ${customer.id})`);

    const { count, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('phone', phone)
        .eq('is_loyalty_eligible', true)
        .is('loyalty_redeemed_at', null);
    
    if (countError) {
        console.error("Error counting orders:", countError);
    } else {
        console.log(`Eligible unredeemed orders count: ${count}`);
    }
}

check();
