import type { Client, Sticker } from "discord.js";
const set = new Set();
const guildId = "735499671648206889"

export default (client: Client) => {
    client.on("messageCreate", async (message) => {
        if (guildId !== message.guildId) return
        if (set.has(true)) return
        const content = message.content;
        if (content.toLowerCase() == "lewd" || content.toLowerCase() == "lood" || content.toLowerCase() == "so lood" || content.toLowerCase() == "so lewd") {
            set.add(true);
            setTimeout(() => {
                set.delete(true)
            }, 1000 * 60 * 60);
            message.reply({
                stickers: [client.guilds.cache.get(guildId)?.stickers.cache.get("1008452255118262312") as Sticker],
                allowedMentions: { parse: [] }
            });
        }
    });
};

export const config = {
    displayName: 'Lewd Feature',
    dbName: 'LEWDALERT',
}