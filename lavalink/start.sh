#!/usr/bin/env bash
# Starts the Lavalink audio node.
#
# The system default JVM is Java 8, which Lavalink v4 cannot run on, so the
# Java 21 runtime is pinned explicitly here.
set -euo pipefail

JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"
JAVA_BIN="$JAVA_HOME/bin/java"

if [ ! -x "$JAVA_BIN" ]; then
    echo "Java 21 not found at $JAVA_BIN. Set JAVA_HOME to your JDK 21 install." >&2
    exit 1
fi

cd "$(dirname "$0")"

if [ ! -f Lavalink.jar ]; then
    download_url="${LAVALINK_DOWNLOAD_URL:-https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar}"
    temporary_jar=$(mktemp ./Lavalink.jar.XXXXXX)
    trap 'rm -f "$temporary_jar"' EXIT

    echo "Lavalink.jar not found; downloading it from the official release..." >&2
    if command -v curl >/dev/null 2>&1; then
        curl --fail --location --retry 3 --output "$temporary_jar" "$download_url"
    elif command -v wget >/dev/null 2>&1; then
        wget --tries=3 --output-document="$temporary_jar" "$download_url"
    else
        echo "Install curl or wget, or place Lavalink.jar in the lavalink directory." >&2
        exit 1
    fi

    mv "$temporary_jar" Lavalink.jar
    trap - EXIT
fi

# Load only the keys this node needs from the project .env, so the node and the
# bot share one source of truth. Values are read literally (never sourced), so
# characters like `$` inside secrets can't be expanded by the shell.
if [ -f ../.env ]; then
    while IFS= read -r line; do
        key=${line%%=*}
        value=${line#*=}
        value=${value%$'\r'}
        # strip one layer of surrounding quotes if present
        case "$value" in
            \"*\") value=${value#\"}; value=${value%\"} ;;
            \'*\') value=${value#\'}; value=${value%\'} ;;
        esac
        export "$key=$value"
    done < <(grep -E '^(LAVALINK_PASSWORD|SPOTIFY_CLIENT_ID|SPOTIFY_CLIENT_SECRET|YOUTUBE_REFRESH_TOKEN)=' ../.env || true)
fi

# G1 with a small pause target keeps GC hiccups from causing audio stutter.
exec "$JAVA_BIN" \
    -Xms256m -Xmx1G \
    -XX:+UseG1GC \
    -XX:MaxGCPauseMillis=50 \
    -jar Lavalink.jar
