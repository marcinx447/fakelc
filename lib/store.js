const EMPTY = () => ({ users: [], offers: [], withdrawals: [], sessions: {}, announcements: [], rate: {} });
let client;
export async function sbInit() {
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Brak NEXT_PUBLIC_SUPABASE_URL lub SUPABASE_SECRET_KEY.');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
const sb = sbInit;

// tryb testowy bez Supabase (tylko lokalnie: STORE_MOCK=1)
const MOCK = process.env.STORE_MOCK === '1';
const mem = globalThis.__mem || (globalThis.__mem = { row: null, proofs: {} });

export async function load() {
  if (MOCK) {
    if (!mem.row) mem.row = { data: EMPTY(), version: 1 };
    return { db: Object.assign(EMPTY(), JSON.parse(JSON.stringify(mem.row.data))), version: mem.row.version };
  }
  const q = async () => (await sb()).from('app_state').select('data,version').eq('id', 1).maybeSingle();
  let { data, error } = await q();
  if (error) throw error;
  if (!data) {
    await (await sb()).from('app_state').insert({ id: 1, data: EMPTY(), version: 1 }); // ewentualny duplikat ignorujemy
    ({ data, error } = await q());
    if (error || !data) throw error || new Error('Nie można utworzyć bazy.');
  }
  return { db: Object.assign(EMPTY(), data.data), version: data.version };
}

// zapis z blokadą optymistyczną: false = ktoś zapisał w międzyczasie, trzeba ponowić
export async function commit(db, version) {
  if (MOCK) { if (mem.row.version !== version) return false; mem.row = { data: JSON.parse(JSON.stringify(db)), version: version + 1 }; return true; }
  const { data, error } = await (await sb()).from('app_state').update({ data: db, version: version + 1 }).eq('id', 1).eq('version', version).select('version');
  if (error) throw error;
  return data.length === 1;
}

export async function saveProof(id, image) {
  if (MOCK) { mem.proofs[id] = image; return; }
  const { error } = await (await sb()).from('proofs').upsert({ id, image });
  if (error) throw error;
}
export async function getProof(id) {
  if (MOCK) return mem.proofs[id] || null;
  const { data, error } = await (await sb()).from('proofs').select('image').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? data.image : null;
}
export async function deleteProofs(ids) {
  if (MOCK) { ids.forEach((i) => delete mem.proofs[i]); return; }
  if (ids.length) await (await sb()).from('proofs').delete().in('id', ids);
}
