// Category display config, carried over from the old wokcommands `setCategorySettings`.
// Consumed by the help command to render category headers with the server emojis.
export interface CategoryMeta {
    name: string
    emoji: string
    customEmoji: boolean
}

export const CATEGORY_SETTINGS: CategoryMeta[] = [
    { name: "Counter", emoji: "1018261293515415685", customEmoji: true },
    { name: "Fun", emoji: "1018261297206407239", customEmoji: true },
    { name: "Info", emoji: "1018260362371534949", customEmoji: true },
    { name: "Profiles", emoji: "1018586218172264539", customEmoji: true },
    { name: "Reaction", emoji: "1018261286125060146", customEmoji: true },
    { name: "Test", emoji: "1018591268286238772", customEmoji: true },
    { name: "Economy", emoji: "🪙", customEmoji: false },
    { name: "Anime", emoji: "🌸", customEmoji: false },
    { name: "Games", emoji: "🎮", customEmoji: false },
    { name: "Waifu", emoji: "💠", customEmoji: false },
    { name: "Music", emoji: "🎵", customEmoji: false },
    { name: "Admin", emoji: "🛡️", customEmoji: false },
]

/** Renders a category's emoji for use in message content (custom emoji => <:name:id>). */
export function categoryEmoji(name: string): string {
    const meta = CATEGORY_SETTINGS.find((c) => c.name === name)
    if (!meta) return ""
    return meta.customEmoji ? `<:c:${meta.emoji}>` : meta.emoji
}
