import type { Client } from "discord.js";

export default (client: Client) => {
    client.on("messageCreate", async (message) => {

    });
};

export const config = {
    displayName: 'Test Feature',
    dbName: 'TEST',
}