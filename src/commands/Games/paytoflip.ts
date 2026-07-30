import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { addSilver, getSilver, spendSilver } from '../../lib/functions/economy.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

/** Accepted spellings for each side, Turkish first as in the original. */
const HEADS = ['yazı', 'yazi', 'heads', 'h']
const TAILS = ['tura', 'tails', 't']

/**
 * Coin flip for silver, carried over from the old `paytoflip`.
 *
 * The payout looks odd but is deliberate and is kept exactly as it was: you win
 * **3x** your stake or lose **3x** it, rather than staking and winning 2x. That's
 * an even-money bet either way — expected value zero, so it can't be farmed.
 * (Deducting the stake up front *and* paying 3x would make it +EV.)
 */
const MULTIPLIER = 3

@ApplyOptions<Command.Options>({
    name: 'paytoflip',
    aliases: ['pf', 'flipbet'],
    description: 'Call a coin flip and win or lose three times your stake',
    runIn: 'GUILD_ANY',
    cooldownDelay: 3000,
})
export class PayToFlipCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b)
                .setName('paytoflip')
                .setDescription('Call a coin flip and win or lose three times your stake')
                .addStringOption((opt) =>
                    opt
                        .setName('call')
                        .setDescription('Which side?')
                        .setRequired(true)
                        .addChoices(
                            { name: 'yazı / heads', value: 'yazı' },
                            { name: 'tura / tails', value: 'tura' }
                        )
                )
                .addIntegerOption((opt) =>
                    opt.setName('stake').setDescription('How much to stake').setRequired(true).setMinValue(1)
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const call = (await args.pick('string').catch(() => '')).toLowerCase()
        const stake = await args.pick('integer').catch(() => NaN)
        await message.reply(await this.flip(message, message.author, call, stake))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(
            await this.flip(
                interaction,
                interaction.user,
                interaction.options.getString('call', true),
                interaction.options.getInteger('stake', true)
            )
        )
    }

    private async flip(
        ctx: Message | ChatInputCommandInteraction,
        user: User,
        rawCall: string,
        stake: number
    ) {
        const call = HEADS.includes(rawCall) ? 'heads' : TAILS.includes(rawCall) ? 'tails' : null
        if (!call || !Number.isFinite(stake) || stake <= 0) {
            return v2(await resolveKey(ctx, 'games:flip.usage'), { color: 0xe74c3c })
        }

        // A loss costs 3x, so require that much up front — the original didn't
        // check, and a loser could be driven straight into negative silver.
        const risk = stake * MULTIPLIER
        // Take the stake at risk up front and conditionally, so two flips racing
        // each other can't both pass a stale balance check. A win refunds it and
        // pays the same amount again.
        const held = await spendSilver(ctx.guild!.id, user.id, risk)
        if (held === null) {
            return v2(
                await resolveKey(ctx, 'games:flip.notEnough', {
                    risk,
                    balance: await getSilver(ctx.guild!.id, user.id),
                }),
                { color: 0xe74c3c }
            )
        }

        const result = Math.random() < 0.5 ? 'heads' : 'tails'
        const won = result === call
        const newBalance = won ? await addSilver(ctx.guild!.id, user.id, risk * 2) : held
        const side = await resolveKey(ctx, `games:flip.${result}`)

        return v2(
            await resolveKey(ctx, won ? 'games:flip.win' : 'games:flip.lose', {
                side,
                amount: risk,
                balance: newBalance,
            }),
            { color: won ? 0x2ecc71 : 0xe74c3c }
        )
    }
}
