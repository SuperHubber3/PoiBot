import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, MessageFlags } from 'discord.js'
import { REDEEM_CODE_REWARD } from '../../lib/economy/prices.js'
import { addSilver, getSilver } from '../../lib/functions/economy.js'
import { cancelRefund, fundRefund, scheduleRefund } from '../../lib/functions/refunds.js'
import { auditLog } from '../../lib/util/audit.js'
import codesSchema from '../../lib/models/codes-schema.js'
import { guildOnly } from '../../lib/util/install-context.js'

const VALID_CODES = ['reimagined', 'united', 'remastered']

@ApplyOptions<Command.Options>({
    name: 'redeem',
    aliases: ['redeem-code', 'rcode'],
    description: 'Redeem a code!',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class RedeemCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('redeem')
                .setDescription('Redeem a code!')
                .addStringOption((opt) => opt.setName('code').setDescription('Enter the code').setRequired(true))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const code = await args.pick('string').catch(() => undefined)
        await message.reply(await this.redeem(message, message.guild!.id, message.author.id, code))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const code = interaction.options.getString('code', true)
        await interaction.reply({ content: await this.redeem(interaction, interaction.guild!.id, interaction.user.id, code), flags: MessageFlags.Ephemeral })
    }

    private async redeem(ctx: Message | ChatInputCommandInteraction, guildId: string, userId: string, code: string | undefined) {
        const normalizedCode = code?.trim().toLowerCase()
        if (!normalizedCode) return resolveKey(ctx, 'common:redeemInvalid')

        // Valid, unused code → reward. Reading "have they used it?" and then
        // pushing separately let two concurrent redeems both see "no" and both get
        // paid, so the check lives in the write: the code is only pushed if it
        // isn't already there, and only a matched write earns the silver.
        if (VALID_CODES.includes(normalizedCode)) {
            let claimed
            try {
                claimed = await codesSchema.findOneAndUpdate(
                    {
                        guildId,
                        userId,
                        codes: { $not: { $elemMatch: { name: normalizedCode, state: 'true' } } },
                    },
                    {
                        $setOnInsert: { guildId, userId },
                        $push: { codes: { name: normalizedCode, state: 'true' } },
                    },
                    { upsert: true, new: true }
                )
            } catch (error: any) {
                // The row exists and already holds this code, so the filter missed
                // and the upsert collided with the unique (guild,user) index.
                if (error?.code === 11000) return resolveKey(ctx, 'common:redeemAlreadyUsed')
                throw error
            }
            if (!claimed) return resolveKey(ctx, 'common:redeemAlreadyUsed')

            await addSilver(guildId, userId, REDEEM_CODE_REWARD)
            return resolveKey(ctx, 'common:redeemSuccess')
        }

        // Wrong code → troll: yoink all silver for 30 seconds, then give it back.
        // The debt is recorded rather than held in a bare timer, so restarting the
        // bot inside that window doesn't keep someone's whole balance.
        const amount = await getSilver(guildId, userId)
        if (amount > 0) {
            const refundId = await scheduleRefund(guildId, userId, amount)
            const funded = refundId ? await fundRefund(refundId) : false
            if (!funded) {
                await cancelRefund(refundId)
                return resolveKey(ctx, 'common:redeemInvalid')
            }
            // Audit line, as the original sent for this prank.
            await auditLog(`Loser: <@!${userId}> Server: ${guildId} Amount: ${amount}`)
        }
        return resolveKey(ctx, 'common:redeemInvalid')
    }
}
