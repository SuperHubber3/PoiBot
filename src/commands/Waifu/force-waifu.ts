import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, MessageFlags, SendableChannels } from 'discord.js'
import { getCharactersForAnime, MalCharacter } from '../../lib/services/mal.service.js'
import { getSeenCharacterIds } from '../../lib/functions/waifu.js'
import { v2, v2Container, v2Payload } from '../../lib/util/v2.js'
import { sessions } from '../../lib/util/session-store.js'
import { guildOnly } from '../../lib/util/install-context.js'
import { renderWaifuPull, waifuPullActionRow, WaifuPullSession } from '../../lib/waifu/pull.js'

const MAX_COUNT = 20

/**
 * Owner tool: offers someone characters from a chosen anime.
 *
 * It does NOT auto-claim. The original posted a value summary plus one card per
 * character with Claim / Skip / Quick Sell and let the recipient decide, and
 * those cards sit outside the hourly allowance entirely — no claim is consumed
 * and there is no protection window, since the point is to grant a character
 * regardless of what the recipient has left this hour.
 */
@ApplyOptions<Command.Options>({
    name: 'force-waifu',
    description: 'Force a waifu pull for a user from a specific anime (owner only)',
    runIn: 'GUILD_ANY',
    preconditions: ['OwnerOnly'],
})
export class ForceWaifuCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('force-waifu')
                .setDescription('Force a waifu pull for a user from a specific anime (owner only)')
                .addUserOption((opt) => opt.setName('user').setDescription('Recipient').setRequired(true))
                .addIntegerOption((opt) =>
                    opt.setName('anime').setDescription('MAL anime id').setRequired(true).setMinValue(1)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('count')
                        .setDescription(`How many (1-${MAX_COUNT})`)
                        .setMinValue(1)
                        .setMaxValue(MAX_COUNT)
                )
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const target = interaction.options.getUser('user', true)
        const animeId = interaction.options.getInteger('anime', true)
        const count = Math.min(Math.max(1, interaction.options.getInteger('count') ?? 1), MAX_COUNT)
        const guildId = interaction.guild!.id

        const cast = await getCharactersForAnime(animeId)
        if (!cast.length) {
            await interaction.editReply(v2(await resolveKey(interaction, 'waifu:forceNoCharacters', { animeId })))
            return
        }

        // The exclusions the original applied: nothing the recipient already owns
        // or skipped, and no repeats within the batch.
        const seen = await getSeenCharacterIds(guildId, target.id)
        const picked: MalCharacter[] = []
        for (let i = 0; i < count; i++) {
            const available = cast.filter((c) => !seen.has(c.id))
            if (!available.length) break
            const character = available[Math.floor(Math.random() * available.length)]
            seen.add(character.id)
            picked.push(character)
        }

        if (!picked.length) {
            await interaction.editReply(v2(await resolveKey(interaction, 'waifu:forceNoneAvailable')))
            return
        }

        // Nullable when the channel isn't cached or View Channel is missing; the
        // cast used to hide that and every send below would dereference null with
        // the ephemeral defer left hanging.
        const channel = interaction.channel
        if (!channel?.isSendable()) {
            await interaction.editReply(v2(await resolveKey(interaction, 'waifu:forceNoChannel')))
            return
        }
        const total = picked.reduce((sum, c) => sum + c.price, 0)
        const summary = await resolveKey(interaction, 'waifu:forceSummary', {
            user: `<@${target.id}>`,
            count: picked.length,
            total,
            average: Math.round(total / picked.length),
        })
        await channel.send(
            v2Payload(v2Container([`## ${await resolveKey(interaction, 'waifu:forceTitle')}`, summary]))
        )

        for (let i = 0; i < picked.length; i++) {
            const character = picked[i]
            // Cards belong to the recipient — they press the buttons, not the owner.
            const row = await waifuPullActionRow(interaction, target.id, character)
            const container = await renderWaifuPull(interaction, character, row)
            const msg = (await channel.send(v2Payload(container))) as Message
            await sessions.create<WaifuPullSession>(
                msg.id,
                { character, initiatorId: target.id, force: true, animeId, index: i },
                { persist: true }
            )
        }

        await interaction.editReply(
            v2(await resolveKey(interaction, 'waifu:forceSent', { user: `<@${target.id}>`, count: picked.length }))
        )
    }
}
