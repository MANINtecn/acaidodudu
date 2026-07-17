
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

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data: categories } = await supabase.from('categories').select('id, name').ilike('name', '%lanches%');

    // User list: Bacon, Bife de Picanha, Bife, Cheddar, Catupiry, Calabresa, Cebola, Frango, Ovo, Presunto, Queijo
    const targetAddons = ['Bacon', 'Bife', 'Cheddar', 'Catupiry', 'Calabresa', 'Cebola', 'Frango', 'Ovo', 'Presunto', 'Queijo'];

    const { data: addons } = await supabase.from('addons').select('id, name');

    const foundIds: string[] = [];

    addons?.forEach(a => {
        const lowerName = a.name.toLowerCase();
        // Simple strict match logic or broad include
        if (targetAddons.some(t => lowerName.includes(t.toLowerCase()))) {
            foundIds.push(a.id);
        }
    });

    const output = {
        categories: categories || [],
        addonIds: foundIds
    };

    fs.writeFileSync('found_ids.json', JSON.stringify(output, null, 2));
    console.log("Written to found_ids.json");
}

inspect();
