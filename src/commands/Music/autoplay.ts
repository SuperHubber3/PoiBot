import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getAutoplayPref, getQueue, setAutoplayPref } from '../../lib/music/queue.js'
import { updatePanel } from '../../lib/music/panel.js'
import { MusicCtx, canControlQueue, guildIdOf, replyTo } from '../../lib/util/music-ctx.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'autoplay',
    aliases: ['ap'],
    description: 'Toggle autoplay: keeps playing related tracks when the queue ends',
    runIn: 'GUILD_ANY',
})
export class AutoplayCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b).setName('autoplay').setDescription('Toggle autoplay: keeps playing related tracks when the queue ends')
        )
    }

    public override messageRun(message: Message) {
        return this.run(message)
    }

    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        return this.run(interaction)
    }

    private async run(ctx: MusicCtx) {
        // Settable while idle, like the audio filters: the preference lives per
        // guild and the next queue picks it up, so autoplay can be armed before
        // starting anything instead of only being changeable mid-song.
        const guildId = guildIdOf(ctx)
        const queue = getQueue(guildId)
        if (queue && !canControlQueue(ctx, queue)) {
            return replyTo(ctx, await resolveKey(ctx, 'common:musicDifferentVoice'))
        }
        const on = !getAutoplayPref(guildId)
        setAutoplayPref(guildId, on)

        if (queue) void updatePanel(queue)

        const state = await resolveKey(ctx, on ? 'common:musicAutoplayOn' : 'common:musicAutoplayOff')
        if (queue?.current) return replyTo(ctx, state)

        return replyTo(ctx, `${state}\n${await resolveKey(ctx, 'common:musicAutoplayOnNextPlay')}`)
    }
}
