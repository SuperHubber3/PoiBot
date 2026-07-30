import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ChatInputCommandInteraction,
    Message,
    MessageComponentInteraction,
    ModalSubmitInteraction,
    User,
} from 'discord.js'
import { getWaifus, type OwnedWaifu } from '../../lib/functions/waifu.js'
import { pickerRows } from '../../lib/waifu/picker.js'
import { v2, v2Container, v2Payload } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const WAIFU_SELL_CMD = 'wsell'

/**
 * One page of the sell picker. Every page shows 25 cards with their absolute
 * position, so a collection of any size is reachable — the menu used to be
 * capped at the first 25 characters, leaving the rest permanently unsellable.
 */
export async function renderSellPage(
    ctx: Message | ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
    userId: string,
    page: number,
    prefetched?: OwnedWaifu[]
) {
    const list = prefetched ?? await getWaifus(ctx.guild!.id, userId)
    if (!list.length) return v2Container(await resolveKey(ctx, 'waifu:listEmpty'))

    const rows = await pickerRows(ctx, {
        cmd: WAIFU_SELL_CMD,
        owner: userId,
        list,
        page,
        multi: true,
        placeholder: await resolveKey(ctx, 'waifu:sellPlaceholder'),
    })
    const prompt = await resolveKey(ctx, 'waifu:sellPrompt')
    const counter = await resolveKey(ctx, 'waifu:sellCount', { total: list.length })
    return v2Container([prompt, counter], { rows })
}

@ApplyOptions<Command.Options>({
    name: 'sell',
    description: 'Sell claimed characters for silver',
    runIn: 'GUILD_ANY',
})
export class SellCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('sell').setDescription('Sell claimed characters for silver'))
    }

    public override async messageRun(message: Message) {
        await this.sell(message, message.author)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await this.sell(interaction, interaction.user)
    }

    private async sell(ctx: Message | ChatInputCommandInteraction, user: User) {
        const guildId = ctx.guild!.id
        const list = await getWaifus(guildId, user.id)
        const reply = async (payload: any) => {
            if (ctx instanceof Message) return ctx.reply(payload)
            await ctx.reply(payload)
            return ctx.fetchReply()
        }

        if (!list.length) {
            await reply(v2(await resolveKey(ctx, 'waifu:listEmpty')))
            return
        }
        await reply(v2Payload(await renderSellPage(ctx, user.id, 0, list)))
    }
}
