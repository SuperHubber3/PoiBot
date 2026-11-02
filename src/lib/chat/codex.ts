import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { instructions, parseChatResponse } from './response.js'
import { type ChatSettings } from './settings.js'

const schema = {
    type: 'object', additionalProperties: false, required: ['reply', 'remember'],
    properties: {
        reply: { type: 'string' },
        remember: { type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['key', 'fact'],
            properties: { key: { type: 'string' }, fact: { type: 'string' } },
        } },
    },
}

export async function askCodex(prompt: string, settings: ChatSettings) {
    const directory = await mkdtemp(join(tmpdir(), 'poibot-chat-'))
    try {
        const schemaFile = join(directory, 'response.schema.json')
        const resultFile = join(directory, 'response.json')
        const instructionsFile = join(directory, 'instructions.txt')
        await writeFile(schemaFile, JSON.stringify(schema), { mode: 0o600 })
        await writeFile(instructionsFile, instructions, { mode: 0o600 })
        const overrides = [
            `model_reasoning_effort=${JSON.stringify(settings.reasoning)}`,
            ...(settings.tier === 'fast' ? ['service_tier="fast"'] : []), 'approval_policy="never"', 'web_search="disabled"',
            'history.persistence="none"', 'project_doc_max_bytes=0',
            `log_dir=${JSON.stringify(join(directory, 'logs'))}`,
            `model_instructions_file=${JSON.stringify(instructionsFile)}`,
            ...['shell_tool', 'unified_exec', 'apps', 'plugins', 'remote_plugin', 'multi_agent',
                'browser_use', 'computer_use', 'image_generation', 'view_image', 'hooks', 'memories']
                .map((feature) => `features.${feature}=false`),
        ]
        // Pass authentication/runtime settings, never the bot's Discord or database secrets.
        const env: NodeJS.ProcessEnv = {}
        for (const key of ['PATH', 'HOME', 'CODEX_HOME', 'OPENAI_API_KEY', 'TMPDIR', 'TMP', 'TEMP',
            'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR', 'XDG_STATE_HOME',
            'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY',
            'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
            if (process.env[key] !== undefined) env[key] = process.env[key]
        }
        await new Promise<void>((resolve, reject) => {
            const child = spawn(process.env.CODEX_BIN || 'codex', [
                'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
                '--sandbox', 'read-only', '--model', settings.model,
                '--output-schema', schemaFile, '--output-last-message', resultFile,
                ...overrides.flatMap((value) => ['-c', value]), '-',
            ], { cwd: directory, env, stdio: ['pipe', 'ignore', 'ignore'] })
            const timer = setTimeout(() => { child.kill('SIGKILL') }, 120_000)
            child.once('error', (error) => { clearTimeout(timer); reject(error) })
            child.once('close', (code) => {
                clearTimeout(timer)
                if (code === 0) resolve()
                else reject(new Error('Codex did not complete. Check CLI login and model access.'))
            })
            child.stdin.on('error', () => {})
            child.stdin.end(prompt)
        })
        return parseChatResponse(JSON.parse(await readFile(resultFile, 'utf8')))
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
}
