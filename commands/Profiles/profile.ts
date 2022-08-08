import { ICommand } from 'wokcommands'

export default {
    name: 'profile',
    category: 'profile',
    description: 'Peek this one',
    slash: 'both',
    guildOnly: true,
    testOnly: true,

    callback: async ({ guild, user, message, interaction }) => {

    },
} as ICommand