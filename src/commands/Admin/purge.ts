import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ChatInputCommandInteraction,
    Message,
    MessageFlags,
    PermissionFlagsBits,
    RESTJSONErrorCodes,
    TextChannel,
} from 'discord.js'
import { sendable } from '../../lib/util/send.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'purge',
    aliases: ['clear'],
    description: 'Bulk-delete messages (owner only)',
    runIn: 'GUILD_ANY',
    preconditions: ['OwnerOnly'],
    requiredClientPermissions: [PermissionFlagsBits.ManageMessages],
})
export class PurgeCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('purge')
                .setDescription('Bulk-delete messages (owner only)')
                .addIntegerOption((opt) =>
                    opt.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const parsed = await args.pick('integer').catch(() => null)
        if (parsed === null) {
            await message.reply(await resolveKey(message, 'misc:purgeInvalidAmount'))
            return
        }
        const amount = Math.min(100, Math.max(1, parsed))
        // bulkDelete works on the channel's most recent messages, and the newest
        // one is the `poi purge N` invocation itself. Drop that separately rather
        // than asking for amount + 1: at amount = 100 the extra doesn't fit under
        // Discord's cap, and only 99 real messages would go.
        // A failure here isn't cosmetic: if the invocation is still sitting there
        // it takes one of the `amount` slots and only amount - 1 real messages go.
        // Already-gone is the exception, since then it isn't occupying a slot.
        const clearedInvocation = await message
            .delete()
            .then(() => true)
            .catch((error: any) => {
                if (error?.code === RESTJSONErrorCodes.UnknownMessage) return true
                this.container.logger.warn('[purge] could not delete the invocation', error)
                return false
            })
        if (!clearedInvocation) {
            await sendable(message).send(await resolveKey(message, 'misc:purgeInvocationFailed'))
            return
        }

        const deleted = await (message.channel as TextChannel).bulkDelete(amount, true).catch((error) => {
            this.container.logger.warn('[purge] bulk delete failed', error)
            return null
        })
        const count = deleted?.size ?? 0
        const reply = await sendable(message).send(await resolveKey(message, 'common:purgeSuccess', { count }))
        setTimeout(() => reply.delete().catch(() => {}), 4000)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const amount = interaction.options.getInteger('amount', true)
        const deleted = await (interaction.channel as TextChannel).bulkDelete(amount, true).catch((error) => {
            this.container.logger.warn('[purge] bulk delete failed', error)
            return null
        })
        await interaction.reply({
            content: await resolveKey(interaction, 'common:purgeSuccess', { count: deleted?.size ?? 0 }),
            flags: MessageFlags.Ephemeral,
        })
    }
}
