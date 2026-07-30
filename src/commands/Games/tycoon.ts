import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { renderTycoon } from '../../lib/games/tycoon-ui.js'
import { v2Payload } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'tycoon',
    description: 'Idle tycoon: earn points and convert them to silver',
    runIn: 'GUILD_ANY',
    cooldownDelay: 3000,
})
export class TycoonCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder).setName('tycoon').setDescription('Idle tycoon: earn points and convert them to silver')
        )
    }

    public override async messageRun(message: Message) {
        await this.open(message, message.author)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await this.open(interaction, interaction.user)
    }

    private async open(ctx: Message | ChatInputCommandInteraction, user: User) {
        const container = await renderTycoon(ctx, ctx.guild!.id, user.id, user.id, 'home')
        // Buttons are handled by src/interaction-handlers/tycoon.ts — no collector,
        // so the panel never times out and works even when ephemeral.
        if (ctx instanceof Message) await ctx.reply(v2Payload(container))
        else await ctx.reply(v2Payload(container, { ephemeral: true }))
    }
}
