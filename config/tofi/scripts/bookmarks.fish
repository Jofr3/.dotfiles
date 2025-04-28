#!/usr/bin/env fish

set bookmarks "
gmail|https://mail.google.com/mail/u/0/#inbox
gpt|https://chatgpt.com
claude|https://claude.ai/new
gemini|https://gemini.google.com/app
nix packages|https://search.nixos.org/packages

calendar|https://calendar.google.com
"

set selected (echo "$bookmarks" | cut -d'|' -f1 | tofi --fuzzy-match=true)
set bookmark (echo "$bookmarks" | grep "^$selected|")
set url (echo "$bookmark" | cut -d'|' -f2)

#  Open the bookmark in the browser if it's not empty

if test -n "$url"
    open "$url"
end


