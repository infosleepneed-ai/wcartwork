import { supabase, BUCKET } from './supabase'

function check({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

const LIST_SELECT = `
  *,
  product:products(*),
  country:countries(*),
  customer:customers(*),
  creator:profiles!artworks_created_by_fkey(id, full_name, role),
  current_version:artwork_versions!fk_current_version(id, version_label, file_path, file_name, mime_type, created_at, metadata),
  steps:approval_steps(id, position, name, role, assignee_ids, state, completed_at)
`

// ---------- Artworks ----------
export async function listArtworks() {
  const rows = check(await supabase.from('artworks').select(LIST_SELECT).order('updated_at', { ascending: false }).limit(2000))
  rows.forEach((r) => r.steps?.sort((a, b) => a.position - b.position))
  return rows
}

export async function getArtwork(id) {
  const row = check(await supabase.from('artworks').select(`
    *,
    product:products(*),
    country:countries(*),
    customer:customers(*),
    creator:profiles!artworks_created_by_fkey(id, full_name, role),
    current_version:artwork_versions!fk_current_version(*),
    steps:approval_steps(*, completer:profiles(id, full_name, role))
  `).eq('id', id).single())
  row.steps?.sort((a, b) => a.position - b.position)
  return row
}

export async function listVersions(artworkId) {
  return check(await supabase.from('artwork_versions')
    .select('*, uploader:profiles(id, full_name, role)')
    .eq('artwork_id', artworkId).order('created_at', { ascending: false }))
}

export async function createArtwork(fields) {
  const { data: { user } } = await supabase.auth.getUser()
  return check(await supabase.from('artworks').insert({ ...fields, created_by: user.id }).select('id, code').single())
}

export async function updateArtwork(id, fields) {
  return check(await supabase.from('artworks').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id))
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120)
}

export async function uploadFile(artworkId, file) {
  const path = `${artworkId}/${Date.now()}-${safeName(file.name)}`
  check(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }))
  return path
}

export async function addVersion(artworkId, file, { label, note, metadata }) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = await uploadFile(artworkId, file)
  return check(await supabase.from('artwork_versions').insert({
    artwork_id: artworkId, version_label: label, change_note: note || null, file_path: path,
    file_name: file.name, mime_type: file.type || null, metadata: metadata || {}, uploaded_by: user.id
  }).select('id').single())
}

export async function addAttachment(artworkId, file) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = await uploadFile(artworkId, file)
  return check(await supabase.from('attachments').insert({
    artwork_id: artworkId, file_path: path, file_name: file.name, mime_type: file.type || null,
    size_bytes: file.size, uploaded_by: user.id
  }))
}

export async function listAttachments(artworkId) {
  return check(await supabase.from('attachments').select('*, uploader:profiles(full_name)')
    .eq('artwork_id', artworkId).order('created_at', { ascending: false }))
}

const urlCache = new Map()
export async function signedUrl(path) {
  if (!path) return null
  const hit = urlCache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const data = check(await supabase.storage.from(BUCKET).createSignedUrl(path, 3600))
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

export async function downloadFile(path, fileName) {
  const data = check(await supabase.storage.from(BUCKET).createSignedUrl(path, 120, { download: fileName || true }))
  window.open(data.signedUrl, '_blank', 'noopener')
}

// ---------- Workflow ----------
export async function decide(artworkId, decision, remarks) {
  return check(await supabase.rpc('decide_step', { p_artwork: artworkId, p_decision: decision, p_remarks: remarks || null }))
}

export async function verifyPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Password is incorrect. Your signature was not applied.')
}

// ---------- Comments ----------
export async function listComments(artworkId) {
  return check(await supabase.from('comments')
    .select('*, author:profiles!comments_author_id_fkey(id, full_name, role)')
    .eq('artwork_id', artworkId).order('created_at', { ascending: true }))
}

export async function addComment(fields) {
  const { data: { user } } = await supabase.auth.getUser()
  return check(await supabase.from('comments').insert({ ...fields, author_id: user.id }).select('id').single())
}

export async function setResolved(id, resolved) {
  const { data: { user } } = await supabase.auth.getUser()
  return check(await supabase.from('comments').update({
    resolved, resolved_by: resolved ? user.id : null, resolved_at: resolved ? new Date().toISOString() : null
  }).eq('id', id))
}

// ---------- Activity ----------
export async function listAudit(artworkId, limit = 12) {
  let q = supabase.from('audit_events')
    .select('*, actor:profiles(full_name, role), artwork:artworks(id, code, product:products(name, strength))')
    .order('created_at', { ascending: false }).limit(limit)
  if (artworkId) q = q.eq('artwork_id', artworkId)
  return check(await q)
}

// ---------- Notifications ----------
export async function listNotifications() {
  return check(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(40))
}
export async function markNotification(id) {
  return check(await supabase.from('notifications').update({ read: true }).eq('id', id))
}
export async function markAllNotifications(userId) {
  return check(await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false))
}

// ---------- Master data ----------
export async function listProducts() {
  return check(await supabase.from('products').select('*').order('name'))
}
export async function listCountries() {
  return check(await supabase.from('countries').select('*').order('name'))
}
export async function listCustomers() {
  return check(await supabase.from('customers').select('*').order('name'))
}
export async function createProduct(fields) {
  return check(await supabase.from('products').insert(fields).select().single())
}
export async function createCustomer(fields) {
  return check(await supabase.from('customers').insert(fields).select().single())
}
export async function createCountry(fields) {
  return check(await supabase.from('countries').insert(fields).select().single())
}

// ---------- People ----------
export async function listProfiles() {
  return check(await supabase.from('profiles').select('*').order('full_name'))
}
export async function updateProfile(id, fields) {
  return check(await supabase.from('profiles').update(fields).eq('id', id))
}

// ---------- Workflows ----------
export async function listWorkflows() {
  const rows = check(await supabase.from('workflows').select('*, steps:workflow_steps(*)').order('created_at'))
  rows.forEach((w) => w.steps?.sort((a, b) => a.position - b.position))
  return rows
}
export async function saveWorkflow(w) {
  return check(await supabase.rpc('save_workflow', {
    p_id: w.id || null, p_name: w.name, p_description: w.description || null, p_default: !!w.is_default,
    p_active: !!w.active, p_allowed_roles: w.allowed_roles || [],
    p_steps: w.steps.map((s) => ({ name: s.name, role: s.role || '', assignee_ids: s.assignee_ids || [] }))
  }))
}
export async function deleteWorkflow(id) {
  return check(await supabase.from('workflows').delete().eq('id', id))
}

// ---------- Saved views ----------
export async function listSavedViews() {
  return check(await supabase.from('saved_views').select('*').order('created_at'))
}
export async function createSavedView(name, filters) {
  const { data: { user } } = await supabase.auth.getUser()
  return check(await supabase.from('saved_views').insert({ name, filters, user_id: user.id }).select().single())
}
export async function deleteSavedView(id) {
  return check(await supabase.from('saved_views').delete().eq('id', id))
}
