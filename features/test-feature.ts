import type { Client } from "discord.js";

export default (client: Client) => {
    client.on("messageCreate", async (message) => {
        const content = message.content;
        if (content === "ping") {
            message.reply({
                content: "Pong!",
            });
        }
    });
};
