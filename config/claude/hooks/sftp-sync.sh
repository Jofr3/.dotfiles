#!/usr/bin/env bash
# SFTP Sync — PostToolUse hook for Claude Code
#
# Uploads files to a remote server after Write/Edit/Bash tool calls.
# Reads connection config from .vscode/sftp.json in the project directory.
# Supports SFTP (key or password auth) and FTP (password auth via curl).
#
# Receives JSON on stdin from Claude Code with:
#   tool_name, tool_input, cwd, hook_event_name

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

[[ -z "$CWD" ]] && exit 0

# --- Load config ---

CONFIG_PATH="$CWD/.vscode/sftp.json"
[[ -f "$CONFIG_PATH" ]] || exit 0

CONFIG_JSON=$(cat "$CONFIG_PATH")
if echo "$CONFIG_JSON" | jq -e 'type == "array"' &>/dev/null; then
    CONFIG_JSON=$(echo "$CONFIG_JSON" | jq '.[0]')
fi

for field in host protocol username remotePath; do
    val=$(echo "$CONFIG_JSON" | jq -r ".$field // empty")
    [[ -z "$val" ]] && exit 0
done

cfg() { echo "$CONFIG_JSON" | jq -r "$1 // empty"; }

HOST=$(cfg '.host')
PROTOCOL=$(cfg '.protocol')
USERNAME=$(cfg '.username')
REMOTE_BASE=$(cfg '.remotePath' | sed 's:/*$::')

# --- Ignore checking ---

should_ignore() {
    local rel_path="$1"
    while IFS= read -r pattern; do
        [[ -z "$pattern" ]] && continue
        if [[ "$pattern" == \*.* ]]; then
            [[ "$rel_path" == *"${pattern#\*}" ]] && return 0
            continue
        fi
        [[ "$rel_path" == "$pattern" || "$rel_path" == "$pattern"/* || "/$rel_path" == *"/$pattern/"* ]] && return 0
    done < <(echo "$CONFIG_JSON" | jq -r '.ignore // [] | .[]' 2>/dev/null)
    return 1
}

# --- Upload a single file ---

upload_file() {
    local abs_path="$1"
    [[ -f "$abs_path" ]] || return 1

    local rel_path
    rel_path=$(realpath --relative-to="$CWD" "$abs_path" 2>/dev/null) || return 1
    [[ "$rel_path" == ..* ]] && return 1
    should_ignore "$rel_path" && return 0

    local remote_file="${REMOTE_BASE}/${rel_path}"

    case "$PROTOCOL" in
        sftp)
            local port key password prefix flags target remote_dir
            port=$(echo "$CONFIG_JSON" | jq -r '.port // 22')
            key=$(cfg '.privateKeyPath')
            password=$(cfg '.password')

            prefix=""
            [[ -n "$password" && -z "$key" ]] && prefix="sshpass -p '$password' "

            flags="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
            [[ -n "$key" ]] && flags="-i '$key' $flags"

            target="${USERNAME}@${HOST}"
            remote_dir=$(dirname "$remote_file")

            eval "${prefix}ssh ${flags} -p ${port} '${target}' 'mkdir -p ${remote_dir}'" 2>/dev/null || return 1
            eval "${prefix}scp ${flags} -P ${port} '${abs_path}' '${target}:${remote_file}'" 2>/dev/null || return 1
            ;;
        ftp)
            local port password
            port=$(echo "$CONFIG_JSON" | jq -r '.port // 21')
            password=$(cfg '.password')
            curl -T "$abs_path" "ftp://${HOST}:${port}${remote_file}" \
                --user "${USERNAME}:${password}" \
                --ftp-create-dirs -s \
                --connect-timeout 10 --max-time 60 || return 1
            ;;
        *) return 1 ;;
    esac

    echo "[SFTP synced: $rel_path -> $HOST]" >&2
    return 0
}

# --- Main ---

case "$TOOL_NAME" in
    Write|Edit)
        FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
        [[ -z "$FILE_PATH" ]] && exit 0
        [[ "$FILE_PATH" != /* ]] && FILE_PATH="$CWD/$FILE_PATH"
        upload_file "$FILE_PATH" || true
        ;;
    Bash)
        MARKER="/tmp/.sftp_marker_claude_bash"
        [[ -f "$MARKER" ]] || exit 0

        # Build find excludes
        excludes=(-not -path '*/.git/*')
        while IFS= read -r pattern; do
            [[ -z "$pattern" ]] && continue
            if [[ "$pattern" == \*.* ]]; then
                excludes+=(-not -name "$pattern")
            else
                excludes+=(-not -path "*/$pattern/*")
            fi
        done < <(echo "$CONFIG_JSON" | jq -r '.ignore // [] | .[]' 2>/dev/null)

        uploaded=0
        while IFS= read -r abs_file; do
            [[ -z "$abs_file" ]] && continue
            if upload_file "$abs_file"; then
                ((uploaded++)) || true
            fi
        done < <(find "$CWD" -newer "$MARKER" -type f "${excludes[@]}" 2>/dev/null)

        rm -f "$MARKER"
        [[ $uploaded -gt 0 ]] && echo "[SFTP synced $uploaded file(s) after bash]" >&2
        ;;
esac

exit 0
