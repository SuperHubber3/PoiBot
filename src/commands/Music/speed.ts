import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getFilterState, scheduleFilterFlush } from '../../lib/music/filters.js'
import { getQueue } from '../../lib/music/queue.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'speed',
    description: 'Set playback speed (0.5x – 2.0x, 1 to reset)',
    runIn: 'GUILD_ANY',
})
export class SpeedCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('speed')
                .setDescription('Set playback speed (0.5x – 2.0x, 1 to reset)')
                .addNumberOption((opt) =>
                    opt.setName('rate').setDescription('0.5 – 2.0').setRequired(true).setMinValue(0.5).setMaxValue(2)
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const rate = await args.pick('number').catch(() => Number.NaN)
        await this.run(message, rate)
    }

    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        return this.run(interaction, interaction.options.getNumber('rate', true))
    }

    private async run(ctx: MusicCtx, rate: number) {
        const guildId = guildIdOf(ctx)
        // Settable while idle: the state is stored now and applied when playback starts.
        const queue = getQueue(guildId)
        if (queue && !canControlQueue(ctx, queue)) {
            return ctx.reply(v2(await resolveKey(ctx, 'common:musicDifferentVoice')))
        }

        const clamped = Math.max(0.5, Math.min(2, isNaN(rate) ? 1 : rate))
        getFilterState(guildId).speed = clamped
        scheduleFilterFlush(guildId, queue?.player)
        const [set, shortly] = await Promise.all([
            resolveKey(ctx, 'common:musicSpeedSet', { rate: clamped }),
            resolveKey(ctx, queue?.current ? 'common:musicFilterWillApplyShortly' : 'common:musicFilterOnNextPlay'),
        ])
        return ctx.reply(v2([set, shortly]))
    }
}
