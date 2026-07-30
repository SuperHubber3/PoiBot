import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, MessageFlags, TextChannel } from 'discord.js'
import { sendable } from '../../lib/util/send.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'purge',
    aliases: ['clear'],
    description: 'Bulk-delete messages (owner only)',
    runIn: 'GUILD_ANY',
    preconditions: ['OwnerOnly'],
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
        const deleted = await (message.channel as TextChannel).bulkDelete(amount, true).catch(() => null)
        const reply = await sendable(message).send(await resolveKey(message, 'common:purgeSuccess', { count: deleted?.size ?? 0 }))
        setTimeout(() => reply.delete().catch(() => {}), 4000)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const amount = interaction.options.getInteger('amount', true)
        const deleted = await (interaction.channel as TextChannel).bulkDelete(amount, true).catch(() => null)
        await interaction.reply({
            content: await resolveKey(interaction, 'common:purgeSuccess', { count: deleted?.size ?? 0 }),
            flags: MessageFlags.Ephemeral,
        })
    }
}
