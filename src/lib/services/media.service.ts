import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { container } from '@sapphire/framework'
import { CommandType } from "../enums/command.enum.js";

// src/lib/services/media.service.ts (and dist/lib/services/...) are both three
// directories deep, so the media/ folder at the project root resolves the same
// way whether we run from source (tsx) or the compiled build.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_DIR = path.resolve(__dirname, '../../../media')
const mediaPools = new Map<string, readonly string[]>()
const API_BASE_URL = 'https://nekos.best/api/v2'
const API_TIMEOUT_MS = 8_000
const API_USER_AGENT = 'PoiBot (https://github.com/SuperHubber3/PoiBot)'
export type NekosBestReaction =
    | 'bite'
    | 'cry'
    | 'cuddle'
    | 'hug'
    | 'kiss'
    | 'pat'
    | 'punch'
    | 'slap'
    | 'smug'

const API_REACTIONS = new Set<string>([
    'bite',
    'cry',
    'cuddle',
    'hug',
    'kiss',
    'pat',
    'punch',
    'slap',
    'smug',
])

interface NekosBestResponse {
    results?: Array<{ url?: unknown }>
}

export async function fetchReactionGif(category: NekosBestReaction, fallback: () => string): Promise<string> {
    try {
        const response = await fetch(`${API_BASE_URL}/${category}`, {
            headers: { 'User-Agent': API_USER_AGENT },
            signal: AbortSignal.timeout(API_TIMEOUT_MS),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const body = (await response.json()) as NekosBestResponse
        const url = body.results?.[0]?.url
        if (typeof url !== 'string' || !url.length) throw new Error('Response contained no media URL')
        return url
    } catch (error) {
        container.logger.warn(`[media] nekos.best ${category} request failed; using bundled fallback`, error)
        return fallback()
    }
}

export class MediaService {
    type: CommandType

    constructor(type: CommandType) {
        this.type = type
    }

    getFilename(): string {
        return this.type.toString()
    }

    getMedia(): string {
        const fileName: string = this.getFilename()
        let dataArray = mediaPools.get(fileName)
        if (!dataArray) {
            const parsed: unknown = JSON.parse(
                fs.readFileSync(path.join(MEDIA_DIR, fileName + '.json'), 'utf-8')
            )
            if (!Array.isArray(parsed) || !parsed.length || !parsed.every((item) => typeof item === 'string' && item.length > 0)) {
                throw new Error(`Invalid or empty media pool: ${fileName}.json`)
            }
            dataArray = parsed
            mediaPools.set(fileName, dataArray)
        }

        const randomElement = Math.floor(Math.random() * dataArray.length)
        return dataArray[randomElement]
    }

    /**
     * Fetches a fresh reaction from nekos.best when the command has a matching
     * category. The bundled pool remains a last-known-good fallback for upstream
     * failures and for custom reactions the API does not provide.
     */
    async getReactionMedia(): Promise<string> {
        if (!API_REACTIONS.has(this.type)) return this.getMedia()
        return fetchReactionGif(this.type as NekosBestReaction, () => this.getMedia())
    }
}
