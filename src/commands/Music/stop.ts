import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getQueue } from '../../lib/music/queue.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({ name: 'stop', aliases: ['disconnect', 'dc'], description: 'Stop playback and clear the queue', runIn: 'GUILD_ANY' })
export class StopCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('stop').setDescription('Stop playback and clear the queue'))
    }
    public override messageRun(message: Message) {
        return this.run(message)
    }
    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        return this.run(interaction, true)
    }
    private async run(ctx: MusicCtx, deferred = false) {
        const respond = (payload: ReturnType<typeof v2>) =>
            deferred && ctx instanceof ChatInputCommandInteraction ? ctx.editReply(payload) : ctx.reply(payload)
        const queue = getQueue(guildIdOf(ctx))
        if (queue && !canControlQueue(ctx, queue)) {
            return respond(v2(await resolveKey(ctx, 'common:musicDifferentVoice')))
        }
        const key = !queue ? 'common:musicNothingPlaying' : 'common:musicStopped'
        if (queue) await queue.destroy()
        return respond(v2(await resolveKey(ctx, key)))
    }
}
