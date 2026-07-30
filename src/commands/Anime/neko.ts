import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
} from 'discord.js'
import { buttonRow, v2 } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { anywhere } from '../../lib/util/install-context.js'

export const NEKO_CMD = 'neko'

/**
 * Image categories from nekos.life, verified against
 * `GET https://nekos.life/api/v2/endpoints` — `baka` and `poke` used to be listed
 * here but the API 500s on both, and `avatar`/`wallpaper` were missing.
 */
const SFW_TYPES = [
    'smug', 'tickle', 'slap', 'pat', 'neko', 'meow', 'lizard', 'kiss', 'hug',
    'fox_girl', 'feed', 'cuddle', 'ngif', 'waifu', 'goose', 'gecg', 'woof',
    'avatar', 'wallpaper',
] as const

/**
 * The only three NSFW categories the API still serves. Usable exclusively in
 * channels Discord itself marks age-restricted — see isNsfwChannel().
 */
const NSFW_TYPES = ['lewd', 'spank', 'gasm'] as const

const NSFW_SET: ReadonlySet<string> = new Set(NSFW_TYPES)

/**
 * May NSFW categories be used here?
 *
 * In a guild the channel must be marked age-restricted (threads inherit that from
 * their parent). Outside a guild — a DM, or the app used as a user app — there is
 * no server rule to break and nobody else to expose it to, so it's allowed.
 */
function nsfwAllowed(interaction: ChatInputCommandInteraction): boolean {
    if (!interaction.inGuild()) return true
    const c = interaction.channel as { nsfw?: boolean; parent?: { nsfw?: boolean } } | null
    return Boolean(c?.nsfw ?? c?.parent?.nsfw)
}

@ApplyOptions<Command.Options>({
    name: 'neko',
    description: 'Sends a random anime reaction image',
    cooldownDelay: 3000,
})
export class NekoCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            anywhere(builder)
                .setName('neko')
                .setDescription('Sends a random anime reaction image')
                .addStringOption((opt) =>
                    opt
                        .setName('type')
                        .setDescription('Reaction type')
                        .setRequired(true)
                        .addChoices(
                            ...SFW_TYPES.map((t) => ({ name: t, value: t })),
                            ...NSFW_TYPES.map((t) => ({ name: `🔞 ${t}`, value: t }))
                        )
                )
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const type = interaction.options.getString('type', true)

        if (NSFW_SET.has(type) && !nsfwAllowed(interaction)) {
            await interaction.reply(v2(await resolveKey(interaction, 'anime:nekoNsfwOnly'), { ephemeral: true }))
            return
        }

        await interaction.deferReply()

        let url: string | null = null
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8_000)
        try {
            const res = await fetch(`https://nekos.life/api/v2/img/${type}`, { signal: controller.signal })
            // A retired category answers with an HTML 500 page, which would blow up
            // in res.json() — check the status before parsing.
            const data = res.ok ? ((await res.json()) as any) : null
            url = data?.url ?? null
        } catch {
            url = null
        } finally {
            clearTimeout(timeout)
        }

        if (!url) {
            await interaction.editReply(v2(await resolveKey(interaction, 'anime:nekoNoImage')))
            return
        }

        const row = buttonRow(
            new ButtonBuilder()
                .setCustomId(encodeId({ cmd: NEKO_CMD, owner: interaction.user.id, action: 'delete' }))
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
        )
        await interaction.editReply(v2(await resolveKey(interaction, 'anime:nekoTitle', { type }), {
            image: url,
            rows: [row],
        }))
    }
}
