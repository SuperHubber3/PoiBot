import { ICommand } from 'wokcommands'

export default {
    name: 'f',
    category: 'Reaction',
    description: "Pay respects to something",
    slash: 'both',
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<text>',
    guildOnly: true,
    testOnly: false,
    syntaxError: {
        'text': 'Incorrect usage! Use `{PREFIX}`f {ARGUMENTS}'
    },
    options: [
        { name: 'text', description: 'Thing to pay respects', type: 'STRING', required: true }
    ],

    callback: async ({ interaction: msgInt, channel, args, client }) => {
        const text = msgInt?.options.getString('text') || args[0]
        if (!text) return ":MomijiStare:"
        let num = 0
        const msg = await channel.send({ content: `Press 🇫 to pay respects to **${text}**`, allowedMentions: { parse: [] } })
        await msg.react("🇫")
        const filter = (reaction: any, user: any) => client.user?.id !== msg.author.id;
        const collector = msg.createReactionCollector({ filter, time: 1000 * 60 });
        collector.on("collect", async (reaction, user) => {
            channel.send(`${user.username} has paid their respects.`)
            num++
        })
        collector.on("end", async (reaction, user) => {
            channel.send({ content: `${num} people paid their respects to **${text}**`, allowedMentions: { parse: [] } })
        })
    },
} as ICommand