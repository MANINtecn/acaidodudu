import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data } = await supabase.from('orders').select('is_loyalty_eligible').order('timestamp', { ascending: false }).limit(5);
  console.log('Recent is_loyalty_eligible:', data);
}
check();
