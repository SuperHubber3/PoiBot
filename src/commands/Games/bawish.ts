import { createGachaCommand } from '../../lib/gacha/gacha.js'
import { blueArchiveCharacters } from '../../lib/gacha/rosters.js'

export default createGachaCommand({
    name: 'bawish',
    aliases: ['bwish', 'bluearchive'],
    description: 'Wish for Blue Archive characters',
    game: 'bluearchive',
    titleKey: 'games:gacha.blueArchiveTitle',
    characters: blueArchiveCharacters,
})
