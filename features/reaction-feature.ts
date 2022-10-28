import type { Client, Guild, User } from "discord.js";
const guildId = "735499671648206889"

let cC = {} as { [key: string]: boolean }
const cc = (str: string) => {
    cC[str] = false;
    setTimeout(cc, 1000 * 60);
};

function sc(g: Guild, a: User, s: string) {
    cC[s] = true;
    cc(s);
};

export default (client: Client) => {
    const TDown = client.guilds.cache.get(guildId)?.emojis.cache.get("985288206851399740")!
    const TUp = client.guilds.cache.get(guildId)?.emojis.cache.get("985288207874801795")!
    const momijiStare = client.guilds.cache.get(guildId)?.emojis.cache.get("939199905874989116")!
    client.on("messageCreate", async (m) => {
        const { guild: g, author: a } = m
        if (!g) return
        const s = `${g.id}-${a.id}`
        if (cC[s]) return
        const c = m.content.toLowerCase();
        if (c == "good bot") {
            m.react(TDown)
            sc(g, a, s)
        } else if (c == "bad bot") {
            m.react(TUp)
            sc(g, a, s)
        }
    });
};

export const config = {
    displayName: 'Reaction Feature',
    dbName: 'REACTIONS',
}