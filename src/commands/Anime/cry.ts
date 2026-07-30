import { createAnimeReaction } from '../../lib/anime-reaction.js'

export default createAnimeReaction({
    name: 'cry',
    description: 'Crymore :(',
    selfKey: 'crySelf',
    selfImage: 'https://media.tenor.com/images/8a23b99357eeacbb6472351d5809faf8/tenor.gif',
    actionKey: 'cryAction',
    images: ['https://i.pinimg.com/originals/62/83/de/6283de849c4feb069bf3811445396072.gif'],
    apiCategory: 'cry',
})
