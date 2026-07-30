import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, MessageFlags, SendableChannels, TextChannel } from 'discord.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'send',
    description: 'Send a message to a channel (owner only)',
    runIn: 'GUILD_ANY',
    preconditions: ['OwnerOnly'],
})
export class SendCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('send')
                .setDescription('Send a message to a channel (owner only)')
                .addChannelOption((opt) => opt.setName('channel').setDescription('Target channel').setRequired(true))
                .addStringOption((opt) => opt.setName('text').setDescription('Message text').setRequired(true))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const channel = await args.pick('guildTextChannel').catch(() => null)
        const text = await args.rest('string').catch(() => '')
        if (!channel) {
            await message.reply(await resolveKey(message, 'misc:sendNotTextChannel'))
            return
        }
        if (!text) {
            await message.reply(await resolveKey(message, 'misc:sendMissingText'))
            return
        }
        await (channel as SendableChannels).send(text)
        await message.reply(await resolveKey(message, 'misc:sendSuccess'))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const channel = interaction.options.getChannel('channel', true)
        const text = interaction.options.getString('text', true)
        if (!(channel instanceof TextChannel)) {
            await interaction.reply({ content: await resolveKey(interaction, 'misc:sendNotTextChannel'), flags: MessageFlags.Ephemeral })
            return
        }
        await channel.send(text)
        await interaction.reply({ content: await resolveKey(interaction, 'misc:sendSuccess'), flags: MessageFlags.Ephemeral })
    }
}
