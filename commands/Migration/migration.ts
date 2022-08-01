import { ICommand } from "wokcommands";
import { CommandType } from "../../enums/command.enum";
import { AwardSystemService } from "../../services/award-system.service";

export default {
    name: "migration",
    category: "Test",
    description: "test",
    slash: "both",
    guildOnly: true,
    testOnly: true,

    callback: async ({ guild, user }) => {
        (new AwardSystemService(CommandType.Hug)).createSchemaIfDoesntExists()

        return "Migration executed!";
    },
} as ICommand;
