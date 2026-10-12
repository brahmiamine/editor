import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'

async function handler(name, admin) {
  let serve
  const source = await readFile(new URL('../supabase/functions/' + name + '/index.ts', import.meta.url), 'utf8')
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }).replace(/^import .*;\n/m, '')
  runInContext(js, createContext({ createClient: () => admin, Deno: { env: { get: () => 'test-only' }, serve: fn => { serve = fn } }, Response, Request, TextEncoder, crypto }))
  return serve
}
// A forged body user_id must never select the deletion target; failed file cleanup must not delete the account.
test('account deletion requires verified identity and explicit confirmation', async () => {
  const calls = []
  const admin = { rpc: async () => ({ data:true, error:null }), auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'verified-user' } : null }, error: token === 'valid' ? null : new Error('invalid') }), admin: { signOut: async token => { calls.push('revoke:' + token); return { error: null } }, deleteUser: async id => { calls.push('delete:' + id); return { error: null } } } }, storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) } }
  const serve = await handler('papertrail-account', admin)
  const request = (token, body) => new Request('https://test.invalid', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify(body) })
  assert.equal((await serve(request('invalid', { confirmation:'DELETE' }))).status, 401)
  assert.equal((await serve(request('valid', {}))).status, 400)
  assert.deepEqual(calls, [])
  assert.equal((await serve(request('valid', { confirmation:'DELETE', user_id:'victim' }))).status, 200)
  assert.deepEqual(calls, ['revoke:valid','delete:verified-user'])
  calls.length = 0
  admin.storage.from = () => ({ list: async () => ({ data: null, error: new Error('offline') }) })
  assert.equal((await serve(request('valid', { confirmation:'DELETE' }))).status, 500)
  assert.deepEqual(calls, ['revoke:valid'])
  calls.length = 0
  admin.rpc = async () => ({ data:false, error:null })
  const blocked = await serve(request('valid', { confirmation:'DELETE' }))
  assert.equal(blocked.status,409)
  assert.deepEqual(await blocked.json(), { error:'shared_account' })
  assert.deepEqual(calls,[])
})
test('public shares require a valid token hash and unexpired lookup and never expose owner information', async () => {
  let hash, expiry
  const query = { select: () => query, eq: (_key, value) => { hash = value; return query }, gt: (_key, value) => { expiry = value; return query }, maybeSingle: async () => ({ data: { body: 'Shared text', user_id:'private-owner' }, error: null }) }
  const serve = await handler('papertrail-share', { from: () => query })
  assert.equal((await serve(new Request('https://test.invalid', { method:'POST', body:'{"token":"bad"}' }))).status, 400)
  const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.repeat(2)
  const result = await serve(new Request('https://test.invalid', { method:'POST', body:JSON.stringify({ token }) }))
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.ok(Date.parse(expiry) > 0)
  assert.deepEqual(await result.json(), { body:'Shared text' })
  query.maybeSingle = async () => ({ data: null, error: null })
  assert.equal((await serve(new Request('https://test.invalid', { method:'POST', body:JSON.stringify({ token }) }))).status, 404)
})
