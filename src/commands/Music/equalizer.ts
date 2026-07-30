import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { EQ_PRESETS, getFilterState, scheduleFilterFlush } from '../../lib/music/filters.js'
import { getQueue } from '../../lib/music/queue.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

// Choice value → preset key on queue.filters.equalizerPresets.
const PRESETS = ['Flat', 'FullBass', 'FullTreble', 'FullBassTreble', 'Rock', 'Pop', 'Dance', 'Party', 'Classical', 'Soft', 'Headphones'] as const

@ApplyOptions<Command.Options>({
    name: 'equalizer',
    aliases: ['eq'],
    description: 'Apply a 15-band equalizer preset',
    runIn: 'GUILD_ANY',
})
export class EqualizerCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('equalizer')
                .setDescription('Apply a 15-band equalizer preset')
                .addStringOption((opt) =>
                    opt
                        .setName('preset')
                        .setDescription('Which preset')
                        .setRequired(true)
                        .addChoices(...PRESETS.map((p) => ({ name: p, value: p })))
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const preset = await args.pick('string').catch(() => 'Flat')
        await this.run(message, preset)
    }

    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        return this.run(interaction, interaction.options.getString('preset', true))
    }

    private async run(ctx: MusicCtx, preset: string) {
        const guildId = guildIdOf(ctx)
        // Settable while idle: the state is stored now and applied when playback starts.
        const queue = getQueue(guildId)
        if (queue && !canControlQueue(ctx, queue)) {
            return ctx.reply(v2(await resolveKey(ctx, 'common:musicDifferentVoice')))
        }
        const match = PRESETS.find((p) => p.toLowerCase() === preset.toLowerCase()) ?? 'Flat'
        const state = getFilterState(guildId)
        state.eq = match
        state.eqBands = EQ_PRESETS[match].map((gain, band) => ({ band, gain }))
        scheduleFilterFlush(guildId, queue?.player)
        const [set, shortly] = await Promise.all([
            resolveKey(ctx, 'common:musicEqualizerSet', { preset: match }),
            resolveKey(ctx, queue?.current ? 'common:musicFilterWillApplyShortly' : 'common:musicFilterOnNextPlay'),
        ])
        return ctx.reply(v2([set, shortly]))
    }
}
