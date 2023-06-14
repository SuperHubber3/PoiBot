import type { Client } from "discord.js";

export default (client: Client) => {
    client.on("interactionCreate", async (interaction) => {

    });
};

export const config = {
    displayName: 'Context Menu',
    dbName: 'APPS',
}