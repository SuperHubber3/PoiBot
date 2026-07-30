import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Guild, Message, User } from 'discord.js'
import { addBoop } from '../../lib/functions/counters.js'
import { RAZOR_ID, razorState } from '../../lib/state/razor.js'
import type { AwardReplyTarget } from '../../lib/types.js'
import { v2 } from '../../lib/util/v2.js'
import { anywhere } from '../../lib/util/install-context.js'
import { DM_SCOPE, resolveCounterTarget } from '../../lib/counter-command.js'

@ApplyOptions<Command.Options>({
    name: 'boop',
    description: 'Boop someone!',
    cooldownDelay: 5000,
})
export class BoopCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            anywhere(builder)
                .setName('boop')
                .setDescription('Boop someone!')
                .addUserOption((opt) => opt.setName('user').setDescription('User to boop').setRequired(true))
        )
    }

    private async boopPayload(
        ctx: Message | ChatInputCommandInteraction,
        guildId: string,
        giverId: string,
        targetId: string,
        awardTarget: AwardReplyTarget
    ) {
        const boops = await addBoop(guildId, giverId, targetId, awardTarget)
        return v2(await resolveKey(ctx, boops === 1 ? 'counter:boopFirst' : 'counter:boopCount', {
            target: `<@${targetId}>`,
            count: boops,
        }))
    }

    public override async messageRun(message: Message, args: Args) {
        const rawTarget = await args.pick('string').catch(() => undefined)

        // Legacy shortcut: "poi boop razor" resolves directly, but uses the same
        // recent-speech gate as every other Razor target.
        if (rawTarget === 'razor') {
            if (!razorState.razorCache) {
                await message.reply(v2(await resolveKey(message, 'counter:razorNotRecent')))
                return
            }
            const payload = await this.boopPayload(message, message.guildId ?? DM_SCOPE, message.author.id, RAZOR_ID, message)
            await message.reply({ ...payload, allowedMentions: { parse: [] } })
            razorState.razorCache = false
            return
        }

        await this.execute(message, message.guild, message.guildId ?? DM_SCOPE, message.author, rawTarget, message, (payload) =>
            message.reply({ ...payload, allowedMentions: { parse: [] } })
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const rawTarget = interaction.options.getUser('user')?.toString() ?? undefined
        await this.execute(interaction, interaction.guild, interaction.guildId ?? DM_SCOPE, interaction.user, rawTarget, interaction, (payload) =>
            interaction.reply({ ...payload, allowedMentions: { parse: [] } })
        )
    }

    private async execute(
        ctx: Message | ChatInputCommandInteraction,
        guild: Guild | null,
        guildId: string,
        giver: User,
        rawTarget: string | undefined,
        awardTarget: AwardReplyTarget,
        reply: (payload: ReturnType<typeof v2>) => Promise<unknown>
    ) {
        const target = await resolveCounterTarget(
            ctx,
            guild,
            giver,
            rawTarget,
            'boop',
            (content) => reply(v2(content))
        )
        if (!target) return

        // Only allow booping razor if they've spoken recently.
        if (target === RAZOR_ID && !razorState.razorCache) {
            await reply(v2(await resolveKey(ctx, 'counter:razorNotRecent')))
            return
        }

        const payload = await this.boopPayload(ctx, guildId, giver.id, target, awardTarget)
        await reply(payload)
        if (target === RAZOR_ID) razorState.razorCache = false
    }
}
