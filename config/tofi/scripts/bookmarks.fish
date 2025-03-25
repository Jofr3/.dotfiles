#!/usr/bin/env fish

set bookmarks "
gmail|https://mail.google.com/mail/u/0/#inbox
"

set selected (echo "$bookmarks" | cut -d'|' -f1 | tofi --fuzzy-match=true)
set bookmark (echo "$bookmarks" | grep "^$selected|")
set url (echo "$bookmark" | cut -d'|' -f2)

google-chrome-stable $url
