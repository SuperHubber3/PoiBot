import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { ChatInputCommandInteraction, Message, MessageFlags } from 'discord.js'
import type { GachaGame } from '../../lib/gacha/gacha.js'
import { refreshGachaRoster } from '../../lib/gacha/rosters.js'
import { guildOnly } from '../../lib/util/install-context.js'

const GAMES: GachaGame[] = ['genshin', 'bluearchive']

@ApplyOptions<Command.Options>({
    name: 'refresh-gacha',
    aliases: ['refresh-roster'],
    description: 'Refresh a gacha roster from its API (owner only)',
    preconditions: ['OwnerOnly'],
})
export class RefreshGachaCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('refresh-gacha')
                .setDescription('Refresh a gacha roster from its API (owner only)')
                .addStringOption((option) =>
                    option
                        .setName('game')
                        .setDescription('Roster to refresh')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Genshin Impact', value: 'genshin' },
                            { name: 'Blue Archive', value: 'bluearchive' }
                        )
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const game = await args.pick('string').catch(() => '')
        if (!GAMES.includes(game as GachaGame)) {
            await message.reply('Usage: `poi refresh-gacha <genshin|bluearchive>`')
            return
        }
        await message.reply(await this.refresh(game as GachaGame))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        await interaction.editReply(await this.refresh(interaction.options.getString('game', true) as GachaGame))
    }

    private async refresh(game: GachaGame) {
        try {
            const result = await refreshGachaRoster(game)
            return [
                `Refreshed **${game}** from the API: ${result.total} characters.`,
                `Standard: ${result.counts.standart} · Premium: ${result.counts.premium} · Limited: ${result.counts.limited}`,
                `Live rate-up: ${result.rateUps.join(', ')}`,
            ].join('\n')
        } catch (error) {
            this.container.logger.error(`[gacha] owner-requested ${game} refresh failed`, error)
            return `Could not refresh **${game}**. The last known-good roster is still active.`
        }
    }
}
