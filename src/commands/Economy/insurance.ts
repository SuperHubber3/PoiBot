import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { INSURANCE_COST } from '../../lib/economy/prices.js'
import { addSilver, getSilver, grantInsurance, hasInsurance, spendSilver } from '../../lib/functions/economy.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

/**
 * Buys one-shot protection against /steal's 1% total-wipe roll. The policy is
 * consumed the moment it saves you, so it has to be re-bought after every hit.
 */
@ApplyOptions<Command.Options>({
    name: 'insurance',
    aliases: ['sigorta'],
    description: `Buy protection against losing everything to /steal (costs ${INSURANCE_COST} silver)`,
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class InsuranceCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b).setName('insurance').setDescription('Buy protection against losing everything to /steal')
        )
    }

    public override async messageRun(message: Message) {
        const { text, color } = await this.buy(message, message.guild!.id, message.author)
        await message.reply(v2(text, { color }))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const { text, color } = await this.buy(interaction, interaction.guild!.id, interaction.user)
        await interaction.reply(v2(text, { color, ephemeral: true }))
    }

    private async buy(ctx: Message | ChatInputCommandInteraction, guildId: string, user: User) {
        if (await hasInsurance(guildId, user.id)) {
            return { text: await resolveKey(ctx, 'common:insuranceAlready'), color: 0xf1c40f }
        }

        const remaining = await spendSilver(guildId, user.id, INSURANCE_COST)
        if (remaining === null) {
            return {
                text: await resolveKey(ctx, 'common:insuranceNotEnough', {
                    cost: INSURANCE_COST,
                    balance: await getSilver(guildId, user.id),
                }),
                color: 0xe74c3c,
            }
        }
        // The read above is only a snapshot. Grant conditionally and refund if
        // someone else already bought the policy in between, so two /insurance
        // calls racing each other can't both be charged for one shield.
        if (!(await grantInsurance(guildId, user.id))) {
            await addSilver(guildId, user.id, INSURANCE_COST)
            return { text: await resolveKey(ctx, 'common:insuranceAlready'), color: 0xf1c40f }
        }
        return {
            text: await resolveKey(ctx, 'common:insuranceBought', { cost: INSURANCE_COST, balance: remaining }),
            color: 0x2ecc71,
        }
    }
}
