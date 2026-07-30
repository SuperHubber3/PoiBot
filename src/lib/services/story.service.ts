// Generates short, funny choose-your-own-adventure stories via OpenRouter.
// Model is configurable; defaults to the free Gemma model.
import { container } from '@sapphire/framework'

const MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemma-4-31b-it:free'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export interface StoryRoute {
    /** Short button label (<= ~4 words). */
    label: string
    /** Funny 1-2 sentence outcome shown after picking. */
    ending: string
    /** Whether this route is a "winning" (rewarded) choice. */
    win: boolean
}

export interface StoryData {
    intro: string
    routes: StoryRoute[]
}

function languageName(language: string): string {
    return language.startsWith('tr') ? 'Turkish' : 'English'
}

function buildPrompt(language: string): string {
    return [
        `You are a witty storyteller for a Discord bot. Write a SHORT, funny choose-your-own-adventure in ${languageName(language)}.`,
        'Return ONLY compact minified JSON, no markdown, no commentary, in exactly this shape:',
        '{"intro":"2-3 sentence silly setup","routes":[{"label":"<=4 word button text","ending":"1-2 funny sentences","win":true}]}',
        'Rules: provide 2 to 4 routes; at least one route has "win":true (the clever/correct funny choice) and at least one has "win":false; keep it lighthearted and PG-13; write ALL text in ' +
            languageName(language) +
            '.',
    ].join('\n')
}

/** Extract the first balanced JSON object from a model response. */
function extractJson(text: string): any | null {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
        return JSON.parse(text.slice(start, end + 1))
    } catch {
        return null
    }
}

function validate(obj: any): StoryData | null {
    if (!obj || typeof obj.intro !== 'string' || !Array.isArray(obj.routes)) return null
    const routes: StoryRoute[] = obj.routes
        .filter((r: any) => r && typeof r.label === 'string' && typeof r.ending === 'string')
        .slice(0, 4)
        .map((r: any) => ({
            label: String(r.label).slice(0, 80),
            ending: String(r.ending).slice(0, 3500),
            win: Boolean(r.win),
        }))
    if (routes.length < 2) return null
    // Guarantee both outcomes.
    if (!routes.some((r) => r.win)) routes[Math.floor(Math.random() * routes.length)].win = true
    if (!routes.some((r) => !r.win)) routes[routes.length - 1].win = false
    return { intro: obj.intro.slice(0, 3500), routes }
}

const FALLBACK: Record<string, StoryData> = {
    'en-US': {
        intro: 'You wake up as the chosen hero of a kingdom that mostly needs someone to feed the royal cat. The cat is staring at you. It looks hungry, and slightly evil.',
        routes: [
            { label: 'Feed the cat', ending: 'The cat purrs, knights you on the spot, and names you Duke of Snacks. Glory!', win: true },
            { label: 'Run away', ending: 'You trip over the royal rug and the cat gets your sandwich instead. Tragic.', win: false },
            { label: 'Negotiate', ending: 'You offer the cat a treaty. It signs in tuna. Somehow this counts as a win.', win: true },
        ],
    },
    'tr-TR': {
        intro: 'Bir krallığın seçilmiş kahramanı olarak uyanıyorsun ama krallığın tek ihtiyacı kraliyet kedisini beslemek. Kedi sana bakıyor. Aç ve biraz da şeytani görünüyor.',
        routes: [
            { label: 'Kediyi besle', ending: 'Kedi mırlıyor ve seni Atıştırmalık Dükü ilan ediyor. Zafer!', win: true },
            { label: 'Kaç', ending: 'Kraliyet halısına takılıyorsun ve kedi sandviçini kapıyor. Trajik.', win: false },
            { label: 'Anlaşma yap', ending: 'Kediye bir antlaşma sunuyorsun. Ton balığıyla imzalıyor. Bu bir zafer sayılır.', win: true },
        ],
    },
}

/** Generates a story, falling back to a canned one if the API errors or key is missing. */
export async function generateStory(language: string): Promise<StoryData> {
    const fallback = FALLBACK[language.startsWith('tr') ? 'tr-TR' : 'en-US']
    if (!process.env.OPENROUTER_API_KEY) return fallback

    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: 'user', content: buildPrompt(language) }],
                temperature: 1,
                max_tokens: 600,
            }),
            signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
            container.logger.warn(`[story] OpenRouter returned ${res.status} ${res.statusText}`)
            return fallback
        }
        const json = (await res.json()) as any
        const content: string = json?.choices?.[0]?.message?.content ?? ''
        return validate(extractJson(content)) ?? fallback
    } catch (error) {
        container.logger.warn('[story] OpenRouter request failed', error)
        return fallback
    }
}
