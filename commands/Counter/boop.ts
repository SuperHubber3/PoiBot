import { ICommand } from "wokcommands";
import { addBoop } from "../../functions/counters";

export default {
    name: "boop",
    category: "Anime",
    description: "Boop someone!",
    slash: "both",
    guildOnly: true,
    testOnly: true,

    callback: async ({ message, interaction, guild, user }) => {
        const targetId = "193749488135962625"// user we are booping
        const boops = await addBoop(guild!.id, user.id, targetId)
        if (message) {
            message.reply({ content: `Thats ${boops} boops` });
            return;
        }
        interaction.reply({ content: `Thats ${boops} boops` });
    },
} as ICommand;
