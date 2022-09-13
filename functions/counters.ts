import { Client, Message } from 'discord.js'
import { CommandType } from '../enums/command.enum';
import counterSchema from '../models/command-counter-schema'
import { AwardSystemService } from '../services/award-system.service';

const boopsCache = {} as { [key: string]: number }
const hugsCache = {} as { [key: string]: number }
const punchesCache = {} as { [key: string]: number }
const gehsCache = {} as { [key: string]: number }
const slapsCache = {} as { [key: string]: number }
// const killsCache = {} as { [key: string]: number }
const bitesCache = {} as { [key: string]: number }
const cuddlesCache = {} as { [key: string]: number }
const patsCache = {} as { [key: string]: number }

export default (client: Client) => { }

export const addBoop = async (guildId: string, userId: string, partnerId: string) => {
    console.log("Running findOneAndUpdate()");
    let boopCount = 1
    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                boops: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }
        const boops = schema.boops;
        const index = boops.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            boops.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            boops[index].count += 1;
            boopCount = boops[index].count
        }
        schema.boops = boops;
        return schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    boopsCache[`${guildId}-${userId}`] = boopCount;
    return boopCount;
};

export const getBoop = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = boopsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let boops = 0;
    if (result) {
        result.boops.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                boops = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            boops: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    boopsCache[`${guildId}-${userId}`] = boops;

    return boops;
};

export const addHug = async (guildId: string, userId: string, partnerId: string, message: Message) => {
    console.log("Running findOneAndUpdate()");
    let hugCount = 1

    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                hugs: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            schema.save(function (err: any) {
                if (err) throw err;
            });
            return;
        }

        const hugs = schema.hugs;
        const index = hugs.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            hugs.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            hugs[index].count += 1;
            hugCount = hugs[index].count
        }
        schema.hugs = hugs;
        schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    counterSchema.aggregate([
        {
            $match: {
                userId: userId,
                guildId: guildId,
            }
        },
        {
            $addFields: {
                totalCount: {
                    $sum: "$hugs.count"
                }
            }
        }
    ]).then((result: any) => {
        let item = result[0];
        (new AwardSystemService(CommandType.Hug)).checkForAward(guildId, userId, item.totalCount, message).then((result: boolean) => { })
    });

    hugsCache[`${guildId}-${userId}`] = hugCount;
    return hugCount
};

export const getHug = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = hugsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let hugs = 0;
    if (result) {
        result.hugs.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                hugs = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            hugs: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    hugsCache[`${guildId}-${userId}`] = hugs;

    return hugs;
};

export const addPunch = async (guildId: string, userId: string, partnerId: string, message: Message) => {
    console.log("Running findOneAndUpdate()");
    let punchCount = 1
    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                punches: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }
        const punches = schema.punches;
        const index = punches.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            punches.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            punches[index].count += 1;
            punchCount = punches[index].count
        }
        schema.punches = punches;
        return schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    counterSchema.aggregate([
        {
            $match: {
                userId: userId,
                guildId: guildId,
            }
        },
        {
            $addFields: {
                totalCount: {
                    $sum: "$punches.count"
                }
            }
        }
    ]).then((result: any) => {
        let item = result[0];
        (new AwardSystemService(CommandType.Punch)).checkForAward(guildId, userId, item.totalCount, message).then((result: boolean) => { })
    });

    punchesCache[`${guildId}-${userId}`] = punchCount;
    return punchCount;
};

export const getPunch = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = punchesCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let punches = 0;
    if (result) {
        result.punches.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                punches = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            punches: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    punchesCache[`${guildId}-${userId}`] = punches;

    return punches;
};

export const addGeh = async (guildId: string, userId: string, partnerId: string, message: Message) => {
    console.log("Running findOneAndUpdate()");
    let gehCount = 1
    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                gehs: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }
        const gehs = schema.gehs;
        const index = gehs.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            gehs.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            gehs[index].count += 1;
            gehCount = gehs[index].count
        }
        schema.gehs = gehs;
        return schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    counterSchema.aggregate([
        {
            $match: {
                userId: userId,
                guildId: guildId,
            }
        },
        {
            $addFields: {
                totalCount: {
                    $sum: "$gehs.count"
                }
            }
        }
    ]).then((result: any) => {
        let item = result[0];
        (new AwardSystemService(CommandType.Geh)).checkForAward(guildId, userId, item.totalCount, message).then((result: boolean) => { })
    });

    gehsCache[`${guildId}-${userId}`] = gehCount;
    return gehCount;
};

export const getGeh = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = gehsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let gehs = 0;
    if (result) {
        result.gehs.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                gehs = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            gehs: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    gehsCache[`${guildId}-${userId}`] = gehs;

    return gehs;
};

export const addSlap = async (guildId: string, userId: string, partnerId: string, message: Message) => {
    console.log("Running findOneAndUpdate()");
    let slapCount = 1

    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                slaps: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            schema.save(function (err: any) {
                if (err) throw err;
            });
            return;
        }

        const slaps = schema.slaps;
        const index = slaps.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            slaps.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            slaps[index].count += 1;
            slapCount = slaps[index].count
        }
        schema.slaps = slaps;
        schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    counterSchema.aggregate([
        {
            $match: {
                userId: userId,
                guildId: guildId,
            }
        },
        {
            $addFields: {
                totalCount: {
                    $sum: "$slaps.count"
                }
            }
        }
    ]).then((result: any) => {
        let item = result[0];
        (new AwardSystemService(CommandType.Slap)).checkForAward(guildId, userId, item.totalCount, message).then((result: boolean) => { })
    });

    slapsCache[`${guildId}-${userId}`] = slapCount;
    return slapCount
};

export const getSlap = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = slapsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let slaps = 0;
    if (result) {
        result.slaps.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                slaps = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            slaps: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    slapsCache[`${guildId}-${userId}`] = slaps;

    return slaps;
};

export const addKill = async (guildId: string, userId: string, partnerId: string, message: Message) => {
    console.log("Running findOneAndUpdate()");
    let killCount = 1

    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                kills: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            schema.save(function (err: any) {
                if (err) throw err;
            });
            return;
        }

        const kills = schema.kills;
        const index = kills.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            kills.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            kills[index].count += 1;
            killCount = kills[index].count
        }
        schema.kills = kills;
        schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    counterSchema.aggregate([
        {
            $match: {
                userId: userId,
                guildId: guildId,
            }
        },
        {
            $addFields: {
                totalCount: {
                    $sum: "$kills.count"
                }
            }
        }
    ]).then((result: any) => {
        let item = result[0];
        (new AwardSystemService(CommandType.Kill)).checkForAward(guildId, userId, item.totalCount, message).then((result: boolean) => { })
    });

    // killsCache[`${guildId}-${userId}`] = killCount;
    return killCount
};

export const getKill = async (guildId: string, userId: string, partnerId: string) => {
    // const cachedValue = killsCache[`${guildId}-${userId}`];
    // if (cachedValue) {
    //     return cachedValue;
    // }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let kills = 0;
    if (result) {
        result.kills.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                kills = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            kills: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    // killsCache[`${guildId}-${userId}`] = kills;

    return kills;
};

export const addBite = async (guildId: string, userId: string, partnerId: string, message: Message) => {
    console.log("Running findOneAndUpdate()");
    let biteCount = 1

    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                bites: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            schema.save(function (err: any) {
                if (err) throw err;
            });
            return;
        }

        const bites = schema.bites;
        const index = bites.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            bites.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            bites[index].count += 1;
            biteCount = bites[index].count
        }
        schema.bites = bites;
        schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    counterSchema.aggregate([
        {
            $match: {
                userId: userId,
                guildId: guildId,
            }
        },
        {
            $addFields: {
                totalCount: {
                    $sum: "$bites.count"
                }
            }
        }
    ]).then((result: any) => {
        let item = result[0];
        (new AwardSystemService(CommandType.Bite)).checkForAward(guildId, userId, item.totalCount, message).then((result: boolean) => { })
    });

    bitesCache[`${guildId}-${userId}`] = biteCount;
    return biteCount
};

export const getBite = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = bitesCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let bites = 0;
    if (result) {
        result.bites.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                bites = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            bites: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    bitesCache[`${guildId}-${userId}`] = bites;

    return bites;
};

export const addCuddle = async (guildId: string, userId: string, partnerId: string, message: Message) => {
    console.log("Running findOneAndUpdate()");
    let cuddleCount = 1

    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                cuddles: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            schema.save(function (err: any) {
                if (err) throw err;
            });
            return;
        }

        const cuddles = schema.cuddles;
        const index = cuddles.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            cuddles.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            cuddles[index].count += 1;
            cuddleCount = cuddles[index].count
        }
        schema.cuddles = cuddles;
        schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    counterSchema.aggregate([
        {
            $match: {
                userId: userId,
                guildId: guildId,
            }
        },
        {
            $addFields: {
                totalCount: {
                    $sum: "$cuddles.count"
                }
            }
        }
    ]).then((result: any) => {
        let item = result[0];
        (new AwardSystemService(CommandType.Cuddle)).checkForAward(guildId, userId, item.totalCount, message).then((result: boolean) => { })
    });

    cuddlesCache[`${guildId}-${userId}`] = cuddleCount;
    return cuddleCount
};

export const getCuddle = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = cuddlesCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let cuddles = 0;
    if (result) {
        result.cuddles.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                cuddles = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            cuddles: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    cuddlesCache[`${guildId}-${userId}`] = cuddles;

    return cuddles;
};

export const addPat = async (guildId: string, userId: string, partnerId: string, message: Message) => {
    console.log("Running findOneAndUpdate()");
    let patCount = 1

    await counterSchema.findOne({
        guildId,
        userId,
    }).then((schema: any) => {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                pats: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            schema.save(function (err: any) {
                if (err) throw err;
            });
            return;
        }

        const pats = schema.pats;
        const index = pats.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            pats.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            pats[index].count += 1;
            patCount = pats[index].count
        }
        schema.pats = pats;
        schema.save(function (err: any) {
            if (err) throw err;
        });
    });

    counterSchema.aggregate([
        {
            $match: {
                userId: userId,
                guildId: guildId,
            }
        },
        {
            $addFields: {
                totalCount: {
                    $sum: "$pats.count"
                }
            }
        }
    ]).then((result: any) => {
        let item = result[0];
        (new AwardSystemService(CommandType.Pat)).checkForAward(guildId, userId, item.totalCount, message).then((result: boolean) => { })
    });

    patsCache[`${guildId}-${userId}`] = patCount;
    return patCount
};

export const getPat = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = patsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let pats = 0;
    if (result) {
        result.pats.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                pats = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            pats: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    patsCache[`${guildId}-${userId}`] = pats;

    return pats;
};

export const config = {
    displayName: 'Command Counters',
    dbName: 'COUNTERS',
}