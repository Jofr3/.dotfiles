# Only load SSH keys once per session, not on every shell
if status is-interactive
    and not set -q SSH_AGENT_LOADED
    ssh-add ~/.ssh/keys/* > /dev/null 2>&1
    set -gx SSH_AGENT_LOADED 1
end
