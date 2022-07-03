import { ICommand } from "wokcommands";

export default {
    name: "boop",
    category: "Anime",
    description: "Boop someone!",
    slash: "both", // This is for the usage of the slash commands and message commands at the same time
    guildOnly: true,
    testOnly: true, // This is for faster testing

    callback: async ({ message, interaction }) => {
        if (message) {
            message.reply({ content: "boop" });
            return;
        }
        interaction.reply({ content: "boop" });
    },
} as ICommand;
