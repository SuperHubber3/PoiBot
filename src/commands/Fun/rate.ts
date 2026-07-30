import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Guild, Message, User } from 'discord.js'
import { sendable } from '../../lib/util/send.js'
import md5 from 'md5'
import { resolveTarget } from '../../lib/util/resolveTarget.js'
import { anywhere } from '../../lib/util/install-context.js'

function ratePercent(id: string): number {
    const hash: string = md5(id)
    const digits = hash
        .split('')
        .filter((e: any) => !isNaN(e))
        .join('')
    return parseInt(digits.substring(0, 2), 10)
}

const rateLine = (ctx: Message | ChatInputCommandInteraction, name: string | undefined, percent: number) =>
    resolveKey(ctx, 'fun:rateLine', { name, percent, heart: percent >= 50 ? '❤️' : '💔' })

@ApplyOptions<Command.Options>({
    name: 'rate',
    description: 'Rate someone!',
    cooldownDelay: 5000,
})
export class RateCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            anywhere(builder)
                .setName('rate')
                .setDescription('Rate someone!')
                .addUserOption((opt) => opt.setName('user').setDescription('User to rate').setRequired(true))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const rawTarget = await args.pick('string').catch(() => undefined)

        // "poi rate me" rates the invoker.
        if (rawTarget === 'me') {
            await sendable(message).send({
                content: await rateLine(message, message.author.username, ratePercent(message.author.id)),
                allowedMentions: { parse: [] },
            })
            return
        }

        await this.execute(message, message.guild, message.author, rawTarget, undefined, (content) =>
            sendable(message).send({ content, allowedMentions: { parse: [] } })
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const targetUser = interaction.options.getUser('user', true)
        await this.execute(interaction, interaction.guild, interaction.user, targetUser.toString(), targetUser.username, (content) =>
            interaction.reply({ content, allowedMentions: { parse: [] } })
        )
    }

    private async execute(
        ctx: Message | ChatInputCommandInteraction,
        guild: Guild | null,
        user: User,
        rawTarget: string | undefined,
        optionName: string | undefined,
        send: (content: string) => Promise<unknown>
    ) {
        const resolved = await resolveTarget(guild, rawTarget)
        if (resolved.tooShort) return void send(await resolveKey(ctx, 'fun:targetTooShort'))
        if (resolved.notFound) return void send(await resolveKey(ctx, 'fun:userNotFound', { user: resolved.raw }))
        if (resolved.invalid || !resolved.targetId) return

        const target = resolved.targetId
        const targetName = resolved.targetName ?? optionName

        if (target === user.id) {
            await send(await rateLine(ctx, targetName, ratePercent(user.id)))
            return
        }

        await send(await rateLine(ctx, targetName, ratePercent(target)))
    }
}
