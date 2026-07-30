// Fetches a random post URL from a subreddit via Reddit's public JSON API (no lib/deps).
export async function randomRedditPost(subreddit: string): Promise<string | null> {
    // A stalled connection would otherwise hang the fun command indefinitely and,
    // on the slash path, leave the deferred reply unresolved.
    const abort = AbortSignal.timeout(8000)
    try {
        const res = await fetch(`https://www.reddit.com/r/${subreddit}/new.json?limit=75`, {
            headers: { 'User-Agent': 'PoiBot/2.0' },
            signal: abort,
        })
        if (!res.ok) return null
        const json = (await res.json()) as any
        const posts: any[] = json?.data?.children ?? []
        const usable = posts
            .map((post) => post?.data)
            .filter((data) => data && !data.over_18 && !data.is_self && data.post_hint !== 'self')
            .map((data) => data.url)
            .filter((url): url is string => typeof url === 'string')
        if (!usable.length) return null
        return usable[Math.floor(Math.random() * usable.length)]
    } catch {
        return null
    }
}
