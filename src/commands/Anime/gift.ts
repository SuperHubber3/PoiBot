import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { GIFT_AMOUNT } from '../../lib/economy/prices.js'
import { addSilver, spendSilver } from '../../lib/functions/economy.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'gift',
    description: 'Send a gift of silver to someone ~!',
    runIn: 'GUILD_ANY',
    cooldownDelay: 3000,
})
export class GiftCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('gift')
                .setDescription('Send a gift of silver to someone ~!')
                .addUserOption((opt) => opt.setName('person').setDescription('Tag someone!').setRequired(true))
        )
    }

    public override async messageRun(message: Message) {
        await message.reply(await this.gift(message, message.author, message.mentions.users.first()))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        await interaction.editReply(await this.gift(interaction, interaction.user, interaction.options.getUser('person')))
    }

    private async gift(ctx: Message | ChatInputCommandInteraction, author: User, target: User | null | undefined) {
        if (!target || author.id === target.id) {
            return v2(await resolveKey(ctx, 'anime:giftSelf'))
        }

        const owned = await spendSilver(ctx.guild!.id, author.id, GIFT_AMOUNT)
        if (owned === null) {
            return v2(await resolveKey(ctx, 'anime:giftNotEnough'))
        }

        // Compensate the sender if the credit fails so a partial transfer cannot
        // destroy silver.
        try {
            await addSilver(ctx.guild!.id, target.id, GIFT_AMOUNT)
        } catch (error) {
            await addSilver(ctx.guild!.id, author.id, GIFT_AMOUNT)
            throw error
        }

        return v2(
            [
                await resolveKey(ctx, 'anime:giftTitle'),
                await resolveKey(ctx, 'anime:giftSent', {
                    target: `<@!${target.id}>`,
                    author: `<@!${author.id}>`,
                    amount: GIFT_AMOUNT,
                }),
            ],
            {
                image: 'https://c.wallhere.com/photos/0e/5e/anime_anime_girls_short_hair_long_hair_blonde_brunette_pink_hair_blue_eyes-50715.jpg!d',
            }
        )
    }
}
