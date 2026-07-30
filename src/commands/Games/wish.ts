import { createGachaCommand } from '../../lib/gacha/gacha.js'
import { genshinCharacters } from '../../lib/gacha/rosters.js'

export default createGachaCommand({
    name: 'wish',
    aliases: ['w-genshin'],
    description: 'Wish for Genshin Impact characters',
    game: 'genshin',
    titleKey: 'games:gacha.genshinTitle',
    characters: genshinCharacters,
})
