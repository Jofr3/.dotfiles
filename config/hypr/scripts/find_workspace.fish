#!/usr/bin/env fish

set program $argv[1]
set workspace (hyprctl clients | grep -B 4 "class: $program" | grep "workspace:" | grep -o "[0-9]" | head -1 )
hyprctl dispatch workspace $workspace

