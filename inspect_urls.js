import { createClient } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectUrls() {
    console.log('--- Inspecting Store Logo URLs ---');
    const { data: stores, error: storeError } = await supabase.from('stores').select('id, name, logo_url');
    if (storeError) console.error('Error fetching stores:', storeError);
    else {
        stores.forEach(s => {
            console.log(`Store: ${s.name} (${s.id}) -> Logo: ${s.logo_url}`);
        });
    }

    console.log('\n--- Inspecting Menu Item Image URLs ---');
    const { data: items, error: itemError } = await supabase.from('menu_items').select('id, name, image');
    if (itemError) console.error('Error fetching items:', itemError);
    else {
        let supabaseCount = 0;
        let firebaseCount = 0;
        let otherCount = 0;

        items.forEach(i => {
            const url = i.image || '';
            if (url.includes('supabase.co')) {
                supabaseCount++;
                console.log(`[SUPABASE] Item: ${i.name} (${i.id}) -> ${url}`);
            } else if (url.includes('firebasestorage')) {
                firebaseCount++;
                console.log(`[FIREBASE] Item: ${i.name} (${i.id}) -> ${url}`);
            } else if (url) {
                otherCount++;
                console.log(`[OTHER] Item: ${i.name} (${i.id}) -> ${url}`);
            }
        });

        console.log(`\nSummary:`);
        console.log(`Supabase URLs: ${supabaseCount}`);
        console.log(`Firebase URLs: ${firebaseCount}`);
        console.log(`Other URLs: ${otherCount}`);
    }
}

inspectUrls();
