import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, expect, it, vi } from 'vitest'
import { codexImages } from '../src/codex-images.ts'

const nativeRead = vi.hoisted(() => ({ wait: undefined as (() => Promise<void>) | undefined }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, open: async (...args: Parameters<typeof actual.open>) => {
    if (String(args[0]).includes('generated_images')) await nativeRead.wait?.()
    return actual.open(...args)
  } }
})

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: (executable: string, args: string[], options: import('node:child_process').SpawnOptions) => actual.spawn(process.execPath, [executable, ...args], options) }
})

const owned: string[] = [], providers: ReturnType<typeof codexImages>[] = []
afterEach(async () => {
  nativeRead.wait = undefined
  await Promise.all(providers.splice(0).map(provider => provider.dispose()))
  vi.unstubAllEnvs()
  await Promise.all(owned.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture(mode = 'success', maxBytes = 1024 * 1024, timeoutMs = 3000) {
  const root = await mkdtemp(join(tmpdir(), 'vn-codex-test-')); owned.push(root)
  const home = join(root, 'home'), directory = join(root, 'jobs')
  await mkdir(home); vi.stubEnv('CODEX_HOME', home)
  vi.stubEnv('UNRELATED_API_KEY', 'secret-should-never-reach-child')
  const png = await sharp({ create: { width: 4, height: 2, channels: 4, background: { r: 20, g: 40, b: 80, alpha: 0 } } }).png().toBuffer()
  await writeFile(join(root, 'image.png'), png)
  await writeFile(join(root, 'mode'), mode)
  const script = join(root, 'fake-codex.mjs')
  await writeFile(script, `
import readline from 'node:readline';
import { appendFile, readFile, mkdir, writeFile, link } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const record = value => appendFile(join(root, 'requests.jsonl'), JSON.stringify(value)+'\\n');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
const reply = (id,result) => send({id,result});
await record({spawn:true, argv:process.argv.slice(2), leaked: Boolean(process.env.UNRELATED_API_KEY)});
let thread=0; const threads=new Map();
for await (const line of readline.createInterface({input:process.stdin})) {
 const message=JSON.parse(line), p=message.params||{};
 await record(message);
 const mode=(await readFile(join(root,'mode'),'utf8')).trim();
 if(message.method==='initialize'){ if(mode==='stall-init')continue; if(mode==='invalid-json'){process.stdout.write('private-secret-invalid-json\\n');continue;} reply(message.id,{userAgent:'fake'}); }
 if(message.method==='account/read')reply(message.id,{account:mode==='signed-out'?null:{type:'chatgpt',planType:'pro'},requiresOpenaiAuth:true});
 if(message.method==='modelProvider/capabilities/read')reply(message.id,{imageGeneration:mode!=='unavailable',webSearch:false});
 if(message.method==='skills/list')reply(message.id,{data:[{cwd:p.cwds[0],skills:mode==='missing-skill'?[]:[{name:'imagegen',enabled:mode!=='disabled-skill',path:mode==='relative-skill'?'imagegen/SKILL.md':join(root,'imagegen','SKILL.md')}]}]});
 if(message.method==='thread/start'){const id='thread_'+(++thread);threads.set(id,{cwd:p.cwd});reply(message.id,{thread:{id}});}
 if(message.method==='turn/start'){
  const turnId='turn_'+thread; threads.get(p.threadId).turnId=turnId;
  reply(message.id,{turn:{id:turnId,status:'inProgress',items:[]}});
  if(mode==='exit'){process.stderr.write('private-secret-stderr');process.exit(2);}
  if(mode==='wait'||mode==='late'||mode==='approval'||mode==='stubborn'){
   if(mode==='approval')send({id:900,method:'item/commandExecution/requestApproval',params:{threadId:p.threadId,turnId,itemId:'cmd'}});
   continue;
  }
  const folder=join(process.env.CODEX_HOME,'generated_images',p.threadId);await mkdir(folder,{recursive:true});
  let savedPath=join(folder,'image.png');
  if(mode==='outside')savedPath=join(root,'outside.png');
  await writeFile(savedPath,mode==='invalid-png'?Buffer.from('not-png'):await readFile(join(root,'image.png')));
  if(mode==='hardlink'){await (await import('node:fs/promises')).unlink(savedPath);await link(join(root,'image.png'),savedPath);}
  send({method:'item/completed',params:{threadId:p.threadId,turnId,item:{type:'agentMessage',text:'Use '+join(root,'outside.png')}}});
  send({method:'item/completed',params:{threadId:p.threadId,turnId,item:{type:'imageGeneration',id:'img',status:'completed',savedPath,transparentBackground:true,failure:null,result:'do-not-consume-base64'}}});
  send({method:'turn/completed',params:{threadId:p.threadId,turn:{id:turnId,status:'completed',items:[],error:null}}});
 }
 if(message.method==='turn/interrupt'){
  reply(message.id,{});
  if(mode==='stubborn')continue;
  if(mode==='late'){
   await new Promise(resolve=>setTimeout(resolve,100));
   send({method:'item/completed',params:{threadId:p.threadId,turnId:p.turnId,item:{type:'imageGeneration',status:'completed',failure:null,savedPath:join(root,'outside.png')}}});
  }
  send({method:'turn/completed',params:{threadId:p.threadId,turn:{id:p.turnId,status:'interrupted',items:[],error:null}}});
 }
}
`)
  const provider = codexImages({ executable: script, directory, timeoutMs, maxBytes }); providers.push(provider)
  return { root, home, directory, provider, png, async requests(): Promise<Record<string, unknown>[]> { return (await readFile(join(root, 'requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>) } }
}

const request = () => ({ kind: 'background' as const, prompt: 'Rainy gym entrance', signal: new AbortController().signal })

it('reuses one authenticated process and copies only the completed native PNG into isolated jobs', async () => {
  const f = await fixture()
  expect(await Promise.all([f.provider.ready(), f.provider.ready()])).toEqual([true, true])
  expect(await f.provider.generate(request())).toEqual(f.png)
  const records = await f.requests()
  expect(records.filter(x => x.spawn)).toEqual([{ spawn: true, argv: ['app-server', '--listen', 'stdio://'], leaked: false }])
  const start = records.find(x => x.method === 'thread/start')?.params as Record<string, unknown>
  expect(start).toMatchObject({ ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never' })
  expect(String(start.cwd)).toContain(f.directory)
  const turn = records.find(x => x.method === 'turn/start')?.params as { input: { type: string; text?: string; name?: string }[] }
  expect(turn.input).toContainEqual(expect.objectContaining({ type: 'skill', name: 'imagegen' }))
  expect(turn.input.find(x => x.type === 'text')?.text).toMatch(/landscape.*16:9/i)
  expect(await readFile(join(String(start.cwd), 'generated.png'))).toEqual(f.png)
  await writeFile(join(f.root, 'mode'), 'signed-out')
  expect(await f.provider.ready()).toBe(false)
})

it('checks image capability and never starts a turn while signed out', async () => {
  const f = await fixture('signed-out')
  expect(await f.provider.ready()).toBe(false)
  await expect(f.provider.generate(request())).rejects.toThrow(/sign in/i)
  expect((await f.requests()).some(x => x.method === 'turn/start')).toBe(false)
  await writeFile(join(f.root, 'mode'), 'unavailable')
  expect(await f.provider.ready()).toBe(false)
})

it('uses authored interface composition and attaches local references without character or scene framing', async () => {
  const f = await fixture()
  const square = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 20, g: 40, b: 80, alpha: 0 } } }).png().toBuffer()
  await writeFile(join(f.root, 'image.png'), square)
  const reference = join(f.root, 'heroine.png'); await writeFile(reference, square)
  expect(await f.provider.generate({ ...request(), prompt: 'One barbell cursor, square, pointing upper left.',
    presentation: { purpose: 'interface', transparent: true, references: [reference] } })).toEqual(square)
  const turn = (await f.requests()).find(x => x.method === 'turn/start')?.params as { input: { type: string; path?: string; text?: string }[] }
  expect(turn.input).toContainEqual({ type: 'localImage', path: reference })
  expect(turn.input[0]?.text).toContain('One barbell cursor')
  expect(turn.input[0]?.text).toMatch(/real alpha/i)
  expect(turn.input[0]?.text).not.toMatch(/full.body|no people|landscape 16:9/i)
})

it('requires real alpha for transparent interface assets regardless of their background storage kind', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'image.png'), await sharp({ create: { width: 4, height: 4, channels: 4, background: '#123456' } }).png().toBuffer())
  await expect(f.provider.generate({ ...request(), presentation: { purpose: 'interface', transparent: true } })).rejects.toThrow(/transparent/i)
})

it.each(['missing-skill', 'disabled-skill', 'relative-skill'])('reports unavailable when the imagegen prerequisite is %s', async mode => {
  const f = await fixture(mode)
  expect(await f.provider.ready()).toBe(false)
  await expect(f.provider.generate(request())).rejects.toThrow(/imagegen skill/i)
  expect((await f.requests()).some(x => x.method === 'thread/start' || x.method === 'turn/start')).toBe(false)
  const checked = (await f.requests()).find(x => x.method === 'skills/list')?.params as { cwds: string[] }
  expect(checked.cwds).toEqual([f.directory])
  await writeFile(join(f.root, 'mode'), 'success')
  expect(await f.provider.ready()).toBe(true)
  expect((await f.requests()).filter(x => x.spawn)).toHaveLength(1)
})

it.each(['outside', 'invalid-png', 'hardlink'])('rejects %s native file metadata before returning media', async mode => {
  const f = await fixture(mode)
  await expect(f.provider.generate(request())).rejects.toThrow(/PNG|generated.*file/i)
})

it('cancels during shared process startup before any image turn can begin', async () => {
  const f = await fixture('stall-init', 1024 * 1024, 2000), controller = new AbortController()
  const pending = f.provider.generate({ ...request(), signal: controller.signal }), rejected = expect(pending).rejects.toThrow(/abort/i)
  await expect.poll(async () => (await f.requests()).some(x => x.method === 'initialize')).toBe(true)
  controller.abort()
  await Promise.race([rejected, new Promise((_, reject) => setTimeout(() => reject(new Error('Cancellation waited for startup.')), 500))])
  expect((await f.requests()).some(x => x.method === 'turn/start')).toBe(false)
})

it('rejects oversized PNG files and requires actual alpha for characters', async () => {
  const f = await fixture('success', 20)
  await expect(f.provider.generate(request())).rejects.toThrow(/size|limit/i)
  const g = await fixture()
  await writeFile(join(g.root, 'image.png'), await sharp({ create: { width: 2, height: 4, channels: 3, background: '#123456' } }).png().toBuffer())
  await expect(g.provider.generate({ ...request(), kind: 'character' })).rejects.toThrow(/transparen/i)
  const records = await g.requests()
  const turn = records.find(x => x.method === 'turn/start')?.params as { input: { text?: string }[] }
  expect(turn.input[0]?.text).toMatch(/full.body[\s\S]*transparent/i)
})

it('interrupts an aborted native turn and admits no late artifact', async () => {
  const f = await fixture('late'), controller = new AbortController()
  const pending = f.provider.generate({ ...request(), signal: controller.signal })
  const rejected = expect(pending).rejects.toThrow(/abort/i)
  await expect.poll(async () => (await f.requests()).some(x => x.method === 'turn/start')).toBe(true)
  controller.abort(); await rejected
  expect((await f.requests()).some(x => x.method === 'turn/interrupt')).toBe(true)
  const jobs = await readdir(f.directory)
  expect(await readdir(join(f.directory, jobs[0]!))).toEqual([])
  // A late completion must be drained before the process is reused.
  await writeFile(join(f.root, 'mode'), 'success')
  expect(await f.provider.generate(request())).toEqual(f.png)
})

it('kills a backend that acknowledges interruption without settling the cancelled turn', async () => {
  // Real child startup shares this deadline with interruption settlement and must tolerate concurrent suites.
  const f = await fixture('stubborn'), controller = new AbortController()
  const pending = f.provider.generate({ ...request(), signal: controller.signal }), rejected = expect(pending).rejects.toThrow(/abort/i)
  await expect.poll(async () => (await f.requests()).some(x => x.method === 'turn/start')).toBe(true)
  controller.abort(); await rejected
  await writeFile(join(f.root, 'mode'), 'success')
  expect(await f.provider.ready()).toBe(true)
  expect((await f.requests()).filter(x => x.spawn)).toHaveLength(2)
}, 10000)

it.each(['exit', 'invalid-json'])('contains %s process output and closes failed work', async mode => {
  const f = await fixture(mode)
  await expect(f.provider.generate(request())).rejects.toThrow(/Codex/i)
  await f.provider.dispose()
  expect(await f.provider.ready()).toBe(false)
})

it('times out a stalled native turn and disposal settles pending work', async () => {
  const f = await fixture('wait', 1024 * 1024, 500)
  await expect(f.provider.generate(request())).rejects.toThrow(/time/i)
  const g = await fixture('wait')
  const pending = g.provider.generate(request()), rejected = expect(pending).rejects.toThrow(/dispos|closed/i)
  await expect.poll(async () => (await g.requests()).some(x => x.method === 'turn/start')).toBe(true)
  await g.provider.dispose(); await rejected
}, 10000)

it('disposal rejects completed image work still reading its native PNG', async () => {
  const f = await fixture()
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve }), released = new Promise<void>(resolve => { release = resolve })
  nativeRead.wait = async () => { enter(); await released }
  const pending = f.provider.generate(request()), rejected = expect(pending).rejects.toThrow(/abort|closed|dispos/i)
  await entered
  const disposing = f.provider.dispose()
  release()
  await disposing; await rejected
  const jobs = await readdir(f.directory)
  expect(await readdir(join(f.directory, jobs[0]!))).toEqual([])
})

it('declines unrelated command approval requests', async () => {
  const f = await fixture('approval'), controller = new AbortController()
  const pending = f.provider.generate({ ...request(), signal: controller.signal }), rejected = expect(pending).rejects.toThrow(/abort/i)
  await expect.poll(async () => (await f.requests()).some(x => x.id === 900 && x.result !== undefined)).toBe(true)
  expect((await f.requests()).find(x => x.id === 900 && x.result !== undefined)?.result).toEqual({ decision: 'decline' })
  controller.abort(); await rejected
})
