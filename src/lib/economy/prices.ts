/**
 * Every silver value in the bot, in one place.
 *
 * Balance target ("chill"): a casual player who just runs /daily and fishes a
 * couple of times earns ~400 silver/day; an active player who works the queue,
 * idles the tycoon and sells waifus lands around ~1500/day. Prices below are
 * derived from that, with /daily as the anchor.
 *
 * Design rules:
 *  - Gambling (steal, blackjack, mug) is entertainment: expected value is
 *    slightly negative, so it can't be farmed as income.
 *  - Waifu limit upgrades are the long-term goal — deliberately expensive.
 *  - Idle tycoon is a real income source, and scales with the upgrades you buy.
 *  - Nothing that exists purely for fun (music, meme commands) costs silver.
 */

/** The anchor: one reliable claim per day. */
export const DAILY_REWARD = 250

/** Silver granted each time a user levels up from chat XP. */
export const LEVEL_UP_REWARD = 100

/** One-time codes. */
export const REDEEM_CODE_REWARD = 250

// ---------------------------------------------------------------- fishing
/**
 * A fish is worth half its length in silver, so rarity (which drives length)
 * drives value: a Common is a handful of silver, a Mythic is a genuine payday
 * without eclipsing a full day of play.
 */
export const FISH_SILVER_PER_CM = 0.5

// ---------------------------------------------------------------- steal
export const STEAL_COST = 25
/** 1-10 on d100: the big win. */
export const STEAL_BIG_WIN = 200
/**
 * 11-29: the consolation prize. Stays at 19 because the payout message is the
 * "19 dollar fortnite card" joke — the number is the punchline, not a knob.
 */
export const STEAL_SMALL_WIN = 19
/** Roll ranges: 1..10 big win, 11..29 small win, 30..99 nothing, 100 wipe. */
export const STEAL_SUCC_RATE = 10
export const STEAL_SUCC_RATE_2 = 29
/**
 * Exactly 100: you lose everything — unless you hold insurance, which is
 * consumed instead. Kept as a real risk because the drama is the point.
 */
export const STEAL_WIPE_ROLL = 100

/** One-shot protection against the steal wipe. Consumed when it saves you. */
export const INSURANCE_COST = 500

// ---------------------------------------------------------------- games
/** Upper bound on a blackjack wager, so it can't be used to grind. */
export const BLACKJACK_MAX_BET = 500
/** Shop price of one token used by either character gacha. */
export const WISH_COST = 140
/** Duplicate payout after a character is already at constellation 6. */
export const GACHA_CONSTELLATION_MAX_REWARD = 10

/** Monthly story task payout. */
export const STORY_SILVER_MIN = 100
export const STORY_SILVER_MAX = 300
export const STORY_XP_MIN = 100
export const STORY_XP_MAX = 500

// ---------------------------------------------------------------- tycoon
/**
 * Idle points → silver. Tuned so a fresh player (~1.4k points/day) earns a
 * modest trickle, while someone who has invested in speed/multiply upgrades
 * (~29k points/day) makes it a leading income source.
 */
export const TYCOON_CONVERSIONS: { points: number; silver: number }[] = [
    { points: 50_000, silver: 2500 },
    { points: 20_000, silver: 950 },
    { points: 5_000, silver: 220 },
    { points: 1_000, silver: 40 },
]
/** Upgrade costs in silver: level * step + base. */
export const TYCOON_SPEED_COST = (level: number) => level * 15 + 75
export const TYCOON_MULTIPLY_COST = (level: number) => level * 25 + 100

// ---------------------------------------------------------------- waifu
/** Paid to skip a pulled character. */
export const WAIFU_SKIP_COST = 50
/** Hourly limit upgrades — the long-term money sink. Cost = base * 2^level. */
export const WAIFU_PULLS_UPGRADE_BASE = 750
export const WAIFU_CLAIMS_UPGRADE_BASE = 3000

// ---------------------------------------------------------------- shop
/**
 * VIP status. The biggest single sink in the game by design — it buys a personal
 * colour role via /vipcolor and access to premium character-gacha banners.
 */
export const VIP_COST = 10_000

// ---------------------------------------------------------------- social
/** Transferred by /gift (leaves the sender, reaches the target). */
export const GIFT_AMOUNT = 20

// ---------------------------------------------------------------- awards
/**
 * One-time milestone payouts, by tier index (10 / 500 / 1000 / 5000 / 10000
 * uses). Scaled so the top tier is a trophy rather than an economy reset.
 */
export const AWARD_TIER_REWARDS = [25, 150, 400, 1000, 2500]
