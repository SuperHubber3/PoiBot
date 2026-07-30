import guildSettingsSchema from '../models/guild-settings-schema.js'

export const SUPPORTED_LANGUAGES = ['en-US', 'tr-TR'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// Per-guild language cache so fetchLanguage doesn't hit the DB on every message.
const languageCache = new Map<string, string>()
const supported = (value: unknown): value is SupportedLanguage =>
    typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)

export async function getGuildLanguage(guildId: string | null | undefined): Promise<string> {
    if (!guildId) return 'en-US'
    const cached = languageCache.get(guildId)
    if (cached) {
        if (supported(cached)) return cached
        languageCache.set(guildId, 'en-US')
        return 'en-US'
    }

    const settings = await guildSettingsSchema.findOne({ guildId })
    const language = supported(settings?.language) ? settings.language : 'en-US'
    languageCache.set(guildId, language)
    return language
}

export async function setGuildLanguage(guildId: string, language: SupportedLanguage): Promise<void> {
    await guildSettingsSchema.findOneAndUpdate(
        { guildId },
        { guildId, language },
        { upsert: true }
    )
    languageCache.set(guildId, language)
}
