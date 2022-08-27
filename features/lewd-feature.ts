import type { Client, Sticker } from "discord.js";
const guildId = "735499671648206889"
const set = new Set();

export default (client: Client) => {
    client.on("messageCreate", async (message) => {
        if (guildId !== message.guildId) return
        if (set.has(true)) return
        const content = message.content;
        if ((content.toLowerCase().includes("lewd") || content.toLowerCase().includes("lood")) && !content.toLowerCase().includes("blood")) {
            set.add(true);
            setTimeout(() => {
                set.delete(true)
            }, 1000 * 60 * 60);
            message.reply({
                stickers: [client.guilds.cache.get(guildId)?.stickers.cache.get("1008452255118262312") as Sticker],
            });
        }
    });
};

export const config = {
    displayName: 'Lewd Feature',
    dbName: 'LEWDALERT',
}
