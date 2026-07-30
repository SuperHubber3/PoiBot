import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getQueue } from '../../lib/music/queue.js'
import { updatePanel } from '../../lib/music/panel.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({ name: 'shuffle', description: 'Shuffle the queue', runIn: 'GUILD_ANY' })
export class ShuffleCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('shuffle').setDescription('Shuffle the queue'))
    }
    public override messageRun(message: Message) {
        return this.run(message)
    }
    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        return this.run(interaction)
    }
    private async run(ctx: MusicCtx) {
        const queue = getQueue(guildIdOf(ctx))
        if (queue && !canControlQueue(ctx, queue)) {
            return ctx.reply(v2(await resolveKey(ctx, 'common:musicDifferentVoice')))
        }
        const key = !queue?.tracks.length ? 'common:musicQueueEmpty' : 'common:musicShuffled'
        if (queue?.tracks.length) { queue.shuffle(); void updatePanel(queue) }
        return ctx.reply(v2(await resolveKey(ctx, key)))
    }
}
