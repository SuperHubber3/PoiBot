import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { addSilver, spendSilver } from '../../lib/functions/economy.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'pay',
    description: 'Pay someone with your silver!',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class PayCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('pay')
                .setDescription('Pay someone with your silver!')
                .addUserOption((opt) => opt.setName('user').setDescription('User to pay').setRequired(true))
                .addIntegerOption((opt) =>
                    opt.setName('amount').setDescription('Silver amount').setRequired(true).setMinValue(1)
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        // Pick the user *through args* so the mention token is consumed — otherwise
        // `pick('integer')` reads the mention itself and every `poi pay @x 100`
        // fails as an invalid amount. Failed picks restore arg state, so falling
        // back to mentions is safe.
        const target = await args.pick('user').catch(() => message.mentions.users.first())
        const amount = await args.pick('integer').catch(() => NaN)
        await message.reply(await this.pay(message, message.author, target, amount))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const target = interaction.options.getUser('user', true)
        const amount = interaction.options.getInteger('amount', true)
        await interaction.reply(await this.pay(interaction, interaction.user, target, amount))
    }

    private async pay(ctx: Message | ChatInputCommandInteraction, author: User, target: User | null | undefined, amount: number) {
        if (!target) return resolveKey(ctx, 'common:payMissingTarget')
        if (isNaN(amount) || amount <= 0) return resolveKey(ctx, 'common:payInvalidAmount')
        if (target.id === author.id) return resolveKey(ctx, 'common:paySelf')

        // Conditional deduct: checking then deducting let two concurrent /pay calls
        // both pass the check and push the sender negative.
        const remaining = await spendSilver(ctx.guild!.id, author.id, amount)
        if (remaining === null) return resolveKey(ctx, 'common:payNotEnough')
        let targetTotal: number
        try {
            targetTotal = await addSilver(ctx.guild!.id, target.id, amount)
        } catch (error) {
            await addSilver(ctx.guild!.id, author.id, amount)
            throw error
        }
        return resolveKey(ctx, 'common:paySuccess', {
            target: `<@${target.id}>`,
            amount,
            targetTotal,
            remaining,
        })
    }
}
