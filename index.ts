import DiscordJS, { Intents } from "discord.js";
import WOKCommands from "wokcommands";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// // This is for testing only!
// process.on('uncaughtException', function (err) {
//     console.error(err);
//     console.log(err.message)
//     console.log(err.name)
//     console.log(err.stack)
//     console.log("Node NOT Exiting...");

//     if (err.message == "Interaction has already been acknowledged.") { }
// });

const client = new DiscordJS.Client({
    intents: [
        Intents.FLAGS.DIRECT_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGE_TYPING,
        Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILD_MESSAGE_TYPING,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_VOICE_STATES,
        Intents.FLAGS.GUILD_INVITES,
        Intents.FLAGS.GUILD_BANS,
        Intents.FLAGS.GUILD_INTEGRATIONS,
        Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
        Intents.FLAGS.GUILD_PRESENCES,
        Intents.FLAGS.GUILD_WEBHOOKS,
    ],
});

client.on("ready", async () => {
    console.log("PoiBot Online");
    new WOKCommands(client, {
        commandsDir: path.join(__dirname, "commands"),
        featuresDir: path.join(__dirname, "features"),
        typeScript: true,
        ignoreBots: true,
        mongoUri: process.env.MONGO_URI,
        dbOptions: {
            keepAlive: true
        },
        botOwners: ["338760814884290562", "193749488135962625"],
        testServers: ["993084390722772992"],
        debug: true,
    })
        .setDefaultPrefix("poi ")
        .setCategorySettings([
            {
                name: "Counter",
                emoji: "1018261293515415685",
                customEmoji: true
            },
            {
                name: "Fun",
                emoji: "1018261297206407239",
                customEmoji: true
            },
            {
                name: "Info",
                emoji: "1018260362371534949",
                customEmoji: true
            },
            {
                name: "Profiles",
                emoji: "1018586218172264539",
                customEmoji: true
            },
            {
                name: "Reaction",
                emoji: "1018261286125060146",
                customEmoji: true
            },
            {
                name: "Test",
                emoji: "1018591268286238772",
                customEmoji: true
            }
        ]);
});

client.login(process.env.DISCORD_TOKEN);

export default client
