#!/usr/bin/env fish

set bookmarks "
gmail|https://mail.google.com/mail/u/0/#inbox
gpt|https://chatgpt.com
claude|https://claude.ai/new
nix packages|https://search.nixos.org/packages
"

set selected (echo "$bookmarks" | cut -d'|' -f1 | tofi --fuzzy-match=true)
set bookmark (echo "$bookmarks" | grep "^$selected|")
set url (echo "$bookmark" | cut -d'|' -f2)

#  Open the bookmark in the browser if it's not empty

if test -n "$url"
    google-chrome-stable "$url"
end


