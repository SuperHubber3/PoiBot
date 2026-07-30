import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getFilterState, scheduleFilterFlush } from '../../lib/music/filters.js'
import { getQueue } from '../../lib/music/queue.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

/**
 * Playback rate — resampling rather than time-stretching.
 *
 * `/speed` changes tempo while holding the pitch, which means splicing the audio
 * and sounds grainy when pushed far. `/rate` slows the whole waveform down like a
 * record, dropping the pitch with it, and stays smooth at any value.
 */
@ApplyOptions<Command.Options>({
    name: 'playrate',
    aliases: ['pr'],
    description: 'Slow down / speed up smoothly (pitch moves too, like a record)',
    runIn: 'GUILD_ANY',
})
export class PlayRateCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('playrate')
                .setDescription('Slow down / speed up smoothly (pitch moves too, like a record)')
                .addNumberOption((opt) =>
                    opt
                        .setName('rate')
                        .setDescription('0.5 = one octave down, 1 = normal, 2 = one octave up')
                        .setRequired(true)
                        .setMinValue(0.1)
                        .setMaxValue(3)
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

        const clamped = Math.max(0.1, Math.min(3, isNaN(rate) ? 1 : rate))
        getFilterState(guildId).rate = clamped
        scheduleFilterFlush(guildId, queue?.player)

        const [set, shortly] = await Promise.all([
            resolveKey(ctx, 'common:musicRateSet', { rate: clamped }),
            resolveKey(ctx, queue?.current ? 'common:musicFilterWillApplyShortly' : 'common:musicFilterOnNextPlay'),
        ])
        return ctx.reply(v2([set, shortly]))
    }
}
