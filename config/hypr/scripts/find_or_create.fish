#!/usr/bin/env fish

set programs 'zen' 'org.wezfurlong.wezterm'
set executables 'flatpak run app.zen_browser.zen' 'wezterm'

set program $argv[1]

set exists (hyprctl clients | grep -B 4 "class: $program")
if test -n "$exists"
    set workspace (echo "$exists" | grep "workspace:" | grep -o "[0-9]" | head -1 )
    hyprctl dispatch workspace $workspace
  else
    set index 0
    for programItem in $programs
      set index (math $index + 1)
      if test "$program" = "$programItem"
        break
      end
    end

    hyprctl dispatch exec $executables[$index]
end

