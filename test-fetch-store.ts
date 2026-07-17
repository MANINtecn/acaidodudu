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

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env file');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const runTest = async () => {
    console.log(`Fetching all stores...`);
    const { data: allStores, error: allError } = await supabase
        .from('stores')
        .select('id, slug, name');

    if (allError) {
        console.error("Error fetching all stores:", allError);
    } else {
        console.log(`Found ${allStores?.length} stores:`);
        allStores?.forEach(store => console.log(`- ${store.name} (${store.slug})`));
    }

    console.log(`\nFetching specific store 'papaleguastocmg'...`);
    const { data: specificStore, error: specificError } = await supabase
        .from('stores')
        .select('*')
        .eq('slug', 'papaleguastocmg')
        .limit(1);

    if (specificError) {
        console.error("Error fetching specific store:", specificError);
    } else if (specificStore && specificStore.length > 0) {
        console.log("Specific store found:", specificStore[0].name);
    } else {
        console.log("Specific store NOT found.");
    }
};

runTest();
