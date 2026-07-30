import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { addSilver, debitUpTo } from '../../lib/functions/economy.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'change-balance',
    aliases: ['changebal', 'cbal'],
    description: 'Give or take silver from a user (owner only)',
    runIn: 'GUILD_ANY',
    preconditions: ['OwnerOnly'],
})
export class ChangeBalanceCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('change-balance')
                .setDescription('Give or take silver from a user (owner only)')
                .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
                .addIntegerOption((opt) => opt.setName('amount').setDescription('Silver amount (can be negative)').setRequired(true))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        // See pay.ts: the mention has to be consumed via args, or `pick('integer')`
        // reads the mention token instead of the amount.
        const target = await args.pick('user').catch(() => message.mentions.users.first())
        const amount = await args.pick('integer').catch(() => NaN)
        await message.reply(await this.change(message, target, amount))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const target = interaction.options.getUser('user', true)
        const amount = interaction.options.getInteger('amount', true)
        await interaction.reply(await this.change(interaction, target, amount))
    }

    private async change(ctx: Message | ChatInputCommandInteraction, target: User | null | undefined, amount: number) {
        if (!target) return resolveKey(ctx, 'common:payMissingTarget')
        if (isNaN(amount) || amount === 0) return resolveKey(ctx, 'common:payInvalidAmount')

        const guildId = ctx.guild!.id
        // A debit larger than the balance would leave it negative, and every spend
        // path filters on `silver: { $gte: amount }` — the account would be soft
        // locked with no command able to bring it back up. debitUpTo caps it under
        // a conditional write, so two concurrent debits can't both clear the same
        // balance and push it below zero.
        if (amount < 0) {
            const { taken, silver } = await debitUpTo(guildId, target.id, -amount)
            if (taken === 0) return resolveKey(ctx, 'common:changeBalanceNothingToTake', { target: `<@${target.id}>` })
            return resolveKey(ctx, 'common:changeBalanceSuccess', {
                target: `<@${target.id}>`,
                amount: -taken,
                total: silver,
            })
        }

        const total = await addSilver(guildId, target.id, amount)
        return resolveKey(ctx, 'common:changeBalanceSuccess', { target: `<@${target.id}>`, amount, total })
    }
}
