import { ICommand } from "wokcommands";

export default {
    name: "test",
    category: "Test",
    description: "test",
    slash: "both",
    guildOnly: true,
    testOnly: true,

    callback: async ({ guild, user }) => {
        return "test"
        // ruski hardbass
    },
} as ICommand;
