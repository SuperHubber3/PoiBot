import { ICommand } from 'wokcommands'

export default {
    name: 'ping',
    category: 'Anime',
    description: 'Replies with pong',
    slash: 'both', // This is for the usage of the slash commands
    guildOnly: true,
    testOnly: true, // This is for faster testing

    callback: async ({ }) => {
        return "Pong!" // If we use return it automatically replies both to message and the slash command
    },
} as ICommand