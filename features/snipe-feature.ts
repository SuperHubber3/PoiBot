import { Client } from "discord.js";
let msgCache = {} as { [key: string]: Array<any> }
let didGotFetched = false

export default (client: Client) => {
    client.on("messageCreate", async (message) => {
        if (!message.guild || message.author.bot || didGotFetched) return
        if (message.content.toLowerCase() == "poi snipe") {
            const msg = msgCache[message.guild.id]
            if (!msg) return
            message.channel.send(`<t:${msg[0]}:R> ${msg[1]}: ${msg[2]}`)
            didGotFetched = true
            return
        }
    });
    client.on("messageDelete", async (message) => {
        if (!message.guild || !message.author || message.author.bot) return
        msgCache[`${message.guild.id}`] = [Math.floor(message.createdTimestamp / 1000), message.author.tag, message.content];
        didGotFetched = false
    })
};

export const config = {
    displayName: 'Snipe Feature',
    dbName: 'LASTMSGSNIPE',
}