import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageActionRowComponentBuilder,
    User,
} from 'discord.js'
import { getSilver } from '../../lib/functions/economy.js'
import { STEAL_COST, STEAL_SUCC_RATE } from '../../lib/economy/prices.js'
import { sendable } from '../../lib/util/send.js'
import { encodeId } from '../../lib/util/component-id.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const STEAL_CMD = 'steal'

@ApplyOptions<Command.Options>({
    name: 'steal',
    description: `Attempt a risky heist for silver (costs ${STEAL_COST} silver)`,
    runIn: 'GUILD_ANY',
    cooldownDelay: 60_000,
})
export class StealCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('steal').setDescription('Attempt a risky heist for silver'))
    }

    public override async messageRun(message: Message) {
        await this.run(message, message.author, message.guild!.id, (payload) => sendable(message).send(payload))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        // The prompt IS the reply — no ephemeral "check the channel" detour.
        await this.run(interaction, interaction.user, interaction.guild!.id, (payload) =>
            interaction.reply(payload)
        )
    }

    private async run(
        ctx: Message | ChatInputCommandInteraction,
        user: User,
        guildId: string,
        reply: (payload: any) => Promise<unknown>
    ) {
        if ((await getSilver(guildId, user.id)) < STEAL_COST) {
            await reply(v2(await resolveKey(ctx, 'games:steal.needSilver', { cost: STEAL_COST }), { color: 0xe74c3c }))
            return
        }

        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId(encodeId({ cmd: STEAL_CMD, owner: user.id, action: 'yes' })).setEmoji('👍').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(encodeId({ cmd: STEAL_CMD, owner: user.id, action: 'no' })).setEmoji('👎').setStyle(ButtonStyle.Danger)
        )
        await reply(v2(await resolveKey(ctx, 'games:steal.prompt', { chance: STEAL_SUCC_RATE, cost: STEAL_COST }), { rows: [row], color: 0xf1c40f }))
    }
}
