import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, MessageReaction, User } from 'discord.js'
import { sendable } from '../../lib/util/send.js'
import { guildOnly } from '../../lib/util/install-context.js'

/** Leaves room for the surrounding prompt inside Discord's 2000-char message cap. */
const RESPECTS_MAX_LENGTH = 200

@ApplyOptions<Command.Options>({
    name: 'f',
    description: 'Pay respects to something',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class FCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('f')
                .setDescription('Pay respects to something')
                .addStringOption((opt) =>
                    opt
                        .setName('text')
                        .setDescription('Thing to pay respects')
                        .setRequired(true)
                        .setMaxLength(RESPECTS_MAX_LENGTH)
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        // The prompt interpolates this into a message that also carries the
        // surrounding template, so an unbounded value pushes the send past
        // Discord's 2000-character limit and throws before the collector starts.
        const text = (await args.rest('string').catch(() => undefined))?.slice(0, RESPECTS_MAX_LENGTH)
        if (!text) {
            await message.reply(await resolveKey(message, 'counter:respectsMissing'))
            return
        }
        const msg = await sendable(message).send({
            content: await resolveKey(message, 'counter:respectsPrompt', { text }),
            allowedMentions: { parse: [] },
        })
        await this.startRespects(msg, text)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const text = interaction.options.getString('text', true)
        await interaction.reply({
            content: await resolveKey(interaction, 'counter:respectsPrompt', { text }),
            allowedMentions: { parse: [] },
        })
        const msg = await interaction.fetchReply()
        await this.startRespects(msg, text)
    }

    private async startRespects(msg: Message, text: string) {
        await msg.react('🇫')

        // Count everyone who adds a 🇫, ignoring the bot's own seed reaction. The
        // original filter compared the bot's id against the message author (also the
        // bot), so it was always false and nothing was ever counted.
        const paid = new Set<string>()
        const filter = (reaction: MessageReaction, user: User) =>
            reaction.emoji.name === '🇫' && !user.bot
        const collector = msg.createReactionCollector({ filter, time: 1000 * 60 })

        collector.on('collect', async (_reaction, user) => {
            try {
                if (paid.has(user.id)) return
                paid.add(user.id)
                if (msg.channel.isSendable()) {
                    await msg.channel.send(await resolveKey(msg, 'counter:respectsPaid', { user: user.username }))
                }
            } catch (error) {
                this.container.logger.warn('[respects] collect response failed', error)
            }
        })
        collector.on('end', async () => {
            try {
                if (msg.channel.isSendable()) {
                    await msg.channel.send({
                        content: await resolveKey(msg, 'counter:respectsEnd', { count: paid.size, text }),
                        allowedMentions: { parse: [] },
                    })
                }
            } catch (error) {
                this.container.logger.warn('[respects] end response failed', error)
            }
        })
    }
}
