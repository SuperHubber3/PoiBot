import { Client, Message } from "discord.js";
import { addXP } from "../functions/economy"

export default (client: Client) => {
    client.on("messageCreate", async (message) => {
        const { guild, member } = message;
        if (message.author.bot) return;
        if (message.channel.type === "DM") return;
        addXP(guild!.id, member!.id, 23, message);
    });
};

export const config = {
    displayName: 'Level System',
    dbName: 'LEVELS',
}
