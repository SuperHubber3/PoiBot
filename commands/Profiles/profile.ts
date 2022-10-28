import { ICommand } from 'wokcommands'

export default {
    name: 'profile',
    category: 'Profiles',
    description: 'Coming soon!',
    slash: 'both',
    guildOnly: true,
    testOnly: true,

    callback: async ({ guild, user, message, interaction: msgInt }) => {

    },
} as ICommand