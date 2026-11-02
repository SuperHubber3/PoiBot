import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile, access } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { instructions, parseChatResponse } from './response.js'
import type { ChatSettings } from './settings.js'

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Use the same managed release and personal OAuth profile as T3, without changing its files. */
export async function antigravityInstallation() {
    const base = process.env.CHAT_T3_HOME || join(homedir(), '.t3')
    let executable = process.env.ANTIGRAVITY_BIN
    if (!executable) {
        const tools = join(base, 'tools', 'antigravity-acp', `${process.platform}-${process.arch}`)
        const active: unknown = JSON.parse(await readFile(join(tools, 'active.json'), 'utf8'))
        if (!record(active) || typeof active.releaseId !== 'string' || !/^[a-f0-9]{64}$/.test(active.releaseId)) {
            throw new Error('Invalid T3 Antigravity installation')
        }
        executable = join(tools, 'versions', active.releaseId, process.platform === 'win32' ? 'agy_acp_server.exe' : 'agy_acp_server.par')
    }
    let profile = process.env.CHAT_ANTIGRAVITY_PROFILE
    if (!profile) {
        const profiles = join(base, 'userdata', 'providers', 'antigravity')
        const candidates: string[] = []
        for (const entry of await readdir(profiles, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            const candidate = join(profiles, entry.name)
            try {
                await access(join(candidate, 'antigravity-acp', 'acp_token.json'))
                candidates.push(candidate)
            } catch (error) {
                if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
            }
        }
        if (candidates.length !== 1) throw new Error('Select CHAT_ANTIGRAVITY_PROFILE, or sign in to Antigravity in T3 Code')
        profile = candidates[0]
    }
    if (!profile) throw new Error('Missing Antigravity profile')
    const harness = process.env.ANTIGRAVITY_HARNESS_PATH || join(dirname(executable), process.platform === 'win32' ? 'localharness_external.exe' : 'localharness_external')
    return { executable, harness, profile }
}

export async function askAntigravity(prompt: string, settings: ChatSettings) {
    const installation = await antigravityInstallation()
    const directory = await mkdtemp(join(tmpdir(), 'poibot-antigravity-'))
    try {
        const profile = join(directory, 'profile')
        const acp = join(profile, 'antigravity-acp')
        const cwd = join(directory, 'workspace')
        await mkdir(acp, { recursive: true, mode: 0o700 })
        await mkdir(cwd, { mode: 0o700 })
        await copyFile(join(installation.profile, 'antigravity-acp', 'acp_token.json'), join(acp, 'acp_token.json'))
        await writeFile(join(acp, 'settings.json'), JSON.stringify({ auth: { type: 'oauth-personal' } }), { mode: 0o600 })
        const env: NodeJS.ProcessEnv = {}
        for (const key of ['PATH', 'HOME', 'SystemRoot', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY']) {
            if (process.env[key] !== undefined) env[key] = process.env[key]
        }
        Object.assign(env, {
            GEMINI_HOME: profile, AGY_ACP_FORCE_FILE_STORAGE: '1',
            ANTIGRAVITY_HARNESS_PATH: installation.harness,
            TMPDIR: directory, TMP: directory, TEMP: directory,
            BROWSER: '/bin/false', PYTHONUNBUFFERED: '1',
        })
        const child = spawn(installation.executable, process.platform === 'linux' ? ['--uid='] : [], {
            cwd, env, stdio: ['pipe', 'pipe', 'ignore'],
        })
        const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
        const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
        let sequence = 0
        let output = ''
        let failure: Error | undefined
        const fail = () => {
            failure ??= new Error('Antigravity request failed. Check sign-in, model access, and supported settings.')
            for (const request of pending.values()) request.reject(failure)
            pending.clear()
            child.kill('SIGKILL')
        }
        child.on('error', fail)
        child.stdin.on('error', fail)
        child.on('close', () => { if (pending.size) fail() })
        const send = (value: unknown) => child.stdin.write(`${JSON.stringify(value)}\n`)
        const request = (method: string, params: unknown): Promise<unknown> => {
            if (failure) return Promise.reject(failure)
            const id = ++sequence
            return new Promise((resolve, reject) => {
                pending.set(id, { resolve, reject })
                send({ jsonrpc: '2.0', id, method, params })
            })
        }
        const lines = createInterface({ input: child.stdout })
        // Bound even a peer that emits a huge unterminated line.
        let bytes = 0
        child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 2_000_000) fail() })
        lines.on('line', (line) => {
            try {
                const message: unknown = JSON.parse(line)
                if (!record(message)) return fail()
                if (typeof message.method === 'string' && 'id' in message) {
                    if (message.method === 'session/request_permission') {
                        send({ jsonrpc: '2.0', id: message.id, result: { outcome: { outcome: 'cancelled' } } })
                    } else {
                        send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Tools are disabled' } })
                    }
                    return fail()
                }
                if (message.method === 'session/update' && record(message.params) && record(message.params.update)) {
                    const update = message.params.update
                    if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') return fail()
                    if (update.sessionUpdate === 'agent_message_chunk' && record(update.content) && update.content.type === 'text'
                        && typeof update.content.text === 'string') {
                        output += update.content.text
                        if (output.length > 32_000) fail()
                    }
                } else if (typeof message.id === 'number') {
                    const waiting = pending.get(message.id)
                    if (!waiting) return
                    pending.delete(message.id)
                    if ('error' in message) {
                        waiting.reject(new Error('Antigravity rejected the request'))
                    } else waiting.resolve(message.result)
                }
            } catch { fail() }
        })
        const timer = setTimeout(fail, 120_000)
        try {
            await request('initialize', { protocolVersion: 1, clientInfo: { name: 'zed', version: '0.0.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } })
            await request('authenticate', { methodId: 'oauth-personal' })
            const session = await request('session/new', { cwd, mcpServers: [] })
            if (!record(session) || typeof session.sessionId !== 'string') throw new Error('Invalid ACP session')
            const sessionId = session.sessionId
            await request('session/set_mode', { sessionId, modeId: 'default' })
            const modelResult = await request('session/set_config_option', { sessionId, configId: 'model', value: `${settings.model}-${settings.reasoning}` })
            // Antigravity 1.3 encodes reasoning in model IDs; 1.4 also accepts these IDs.
            if (!record(modelResult)) throw new Error('Invalid ACP model selection')
            const result = await request('session/prompt', { sessionId, prompt: [{ type: 'text', text: `${instructions}\nReturn only JSON matching {"reply":"text","remember":[{"key":"topic","fact":"fact"}]}.\nInput data:\n${prompt}` }] })
            if (failure) throw failure
            if (!record(result) || result.stopReason !== 'end_turn') throw new Error('Antigravity did not complete its reply')
            return parseChatResponse(JSON.parse(output.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1')))
        } finally {
            clearTimeout(timer)
            lines.close()
            child.kill('SIGKILL')
            await closed
        }
    } finally { await rm(directory, { recursive: true, force: true }) }
}
