import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import {
    FilterPreset,
    describeFilters,
    getFilterState,
    scheduleFilterFlush,
} from '../../lib/music/filters.js'
import { getQueue } from '../../lib/music/queue.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

const PRESETS = new Set<FilterPreset>([
    'nightcore',
    'slowedreverb',
    'vaporwave',
    'instagram',
    '8d',
    'lofi',
    'tremolo',
    'vibrato',
    'karaoke',
    'earrape',
])

@ApplyOptions<Command.Options>({
    name: 'filter',
    aliases: ['fx'],
    description: 'Toggle an audio filter (nightcore, 8d, slowed+reverb, bassboost…)',
    runIn: 'GUILD_ANY',
})
export class FilterCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('filter')
                .setDescription('Toggle an audio filter')
                .addStringOption((opt) =>
                    opt
                        .setName('preset')
                        .setDescription('Which effect')
                        .setRequired(true)
                        .addChoices(
                            { name: 'nightcore (pitch up)', value: 'nightcore' },
                            { name: 'slowed + reverb', value: 'slowedreverb' },
                            { name: 'vaporwave', value: 'vaporwave' },
                            { name: 'instagram (very slow, smooth)', value: 'instagram' },
                            { name: '8D audio', value: '8d' },
                            { name: 'bassboost', value: 'bassboost' },
                            { name: 'lofi', value: 'lofi' },
                            { name: 'tremolo', value: 'tremolo' },
                            { name: 'vibrato', value: 'vibrato' },
                            { name: 'karaoke', value: 'karaoke' },
                            { name: 'earrape', value: 'earrape' },
                            { name: 'off (clear all)', value: 'off' }
                        )
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const preset = (await args.pick('string').catch(() => '')).toLowerCase()
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
        const state = getFilterState(guildId)

        if (preset === 'off') {
            state.presets.clear()
            state.speed = 1
            state.rate = 1
            state.bass = 0
            state.eq = null
            state.eqBands = null
            scheduleFilterFlush(guildId, queue?.player)
            const [cleared, shortly] = await Promise.all([
                resolveKey(ctx, 'common:musicFilterCleared'),
                resolveKey(ctx, queue?.current ? 'common:musicFilterWillApplyShortly' : 'common:musicFilterOnNextPlay'),
            ])
            return ctx.reply(v2([cleared, shortly]))
        }

        let isOn: boolean
        if (preset === 'bassboost') {
            state.bass = state.bass > 0 ? 0 : 5
            isOn = state.bass > 0
        } else if (PRESETS.has(preset as FilterPreset)) {
            const filter = preset as FilterPreset
            isOn = !state.presets.has(filter)
            if (isOn) state.presets.add(filter)
            else state.presets.delete(filter)
        } else {
            return ctx.reply(v2(await resolveKey(ctx, 'common:musicNotFound')))
        }

        scheduleFilterFlush(guildId, queue?.player)
        const active = describeFilters(state)
        const [applied, shortly] = await Promise.all([
            resolveKey(ctx, 'common:musicFilterApplied', {
                filter: preset,
                state: isOn ? 'on' : 'off',
                active: active.length ? active.join(', ') : 'none',
            }),
            resolveKey(ctx, queue?.current ? 'common:musicFilterWillApplyShortly' : 'common:musicFilterOnNextPlay'),
        ])
        return ctx.reply(v2([applied, shortly]))
    }
}
