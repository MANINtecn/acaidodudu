
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function getEnvVars() {
    const envPath = path.resolve(process.cwd(), '.env');
    const localEnvPath = path.resolve(process.cwd(), '.env.local');

    let content = '';
    if (fs.existsSync(localEnvPath)) {
        content = fs.readFileSync(localEnvPath, 'utf-8');
    } else if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf-8');
    } else {
        return {};
    }

    const vars: Record<string, string> = {};
    content.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value) {
            vars[key.trim()] = value.join('=').trim();
        }
    });
    return vars;
}

const env = getEnvVars();
const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) { process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

const CATEGORY_ID = 1; // Lanches Tradicionais
const ADDON_IDS = [
    "560b447e-76be-4782-9519-153c51f05ba3",
    "46bb8153-85ac-434c-bbb8-fc641f9d28ae",
    "40739814-e77e-49b4-ab6e-65355c59636a",
    "5a6fedf8-9207-4272-91f9-b5c8c55ebc84",
    "67f7ed38-9d0b-4f04-9cbe-4ba3816de7d3",
    "69bbd360-4c26-4b00-965e-b900ee10d88c",
    "85ec9852-c9a5-49d7-b514-08fd53b589ed",
    "ca1cda02-3aca-4031-87bc-1d2c7f9feb66",
    "e93f7313-fbd1-483b-8298-4c87d04a9925",
    "c5cbd04b-33fd-4664-8b90-832941ed98b3",
    "dff6c22c-38b5-4f26-9a27-c9d94c7c05ff",
    "fd0137eb-145a-4fab-92dc-bf4a89a71773",
    "ae5eb657-ad94-42f8-9ed6-45e1032ad8f1",
    "c2cec69c-0e96-4a8d-afbc-f1c9d2ee9861",
    "44100ea8-cf93-4d9d-80fd-7517700a3973"
];

async function update() {
    console.log(`Updating all items in Category ${CATEGORY_ID} with ${ADDON_IDS.length} addons...`);

    // 1. Get all items in category
    const { data: items, error: fetchError } = await supabase
        .from('menu_items')
        .select('id, name')
        .eq('category_id', CATEGORY_ID);

    if (fetchError) {
        console.error("Error fetching items:", fetchError);
        return;
    }

    console.log(`Found ${items.length} items.`);

    // 2. Update each item
    // Note: We could do a bulk update if Supabase supported 'in' on update, but simple loop is fine for <50 items.
    // Actually, we can update where category_id = 1 directly!

    const { error: updateError } = await supabase
        .from('menu_items')
        .update({ allowed_addons: ADDON_IDS })
        .eq('category_id', CATEGORY_ID);

    if (updateError) {
        console.error("Update failed:", updateError);
    } else {
        console.log("SUCCESS! Updated all items.");
    }
}

update();
