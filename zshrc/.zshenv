chmod 600 ~/.ssh/keys/* >/dev/null 2>&1
eval $(ssh-agent -s) >/dev/null 2>&1
ssh-add ~/.ssh/keys/* >/dev/null 2>&1
