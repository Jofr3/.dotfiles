local wezterm = require 'wezterm'

local config = wezterm.config_builder()

config.unix_domains = {
  {
    name = 'unix',
    local_echo_threshold_ms = 0,
  },
}

config.default_gui_startup_args = { 'connect', 'unix' }

config.default_cursor_style = 'SteadyBar'

config.window_padding = { left = 0, right = 0, top = 0, bottom = 0 }

config.enable_kitty_keyboard = true

function Tab_title(tab_info)
  local title = tab_info.tab_title
  if title and #title > 0 then
    return title
  end
  return tab_info.active_pane.title
end

wezterm.on(
  'format-tab-title',
  function(tab)
    local title = Tab_title(tab)
    local index = tab.tab_index + 1
    if tab.is_active then
      return {
        { Background = { Color = '#3C3836' } },
        { Text = ' ' .. index .. ': ' .. title .. ' ' },
      }
    else
      return {
        { Background = { Color = '#282828' } },
        { Text = ' ' .. index .. ': ' .. title .. ' ' },
      }
    end
  end
)

config.use_fancy_tab_bar = false
config.show_new_tab_button_in_tab_bar = false
config.force_reverse_video_cursor = true
config.hide_tab_bar_if_only_one_tab = true
config.tab_max_width = 100000

config.colors = {
  tab_bar = {
    background = '#282828',
  }
}

local act = wezterm.action

config.keys = {
  {
    key = 'Enter',
    mods = 'CTRL',
    action = act.SpawnTab 'CurrentPaneDomain',
  },
  {
    key = 'c',
    mods = 'CTRL',
    action = act.CloseCurrentTab { confirm = true },
  },
  {
    key = 'f',
    mods = 'CTRL',
    action = act.ShowLauncherArgs {
      flags = 'FUZZY|WORKSPACES',
    },
  },
}

for i = 1, 8 do
  table.insert(config.keys, {
    key = tostring(i),
    mods = 'CTRL',
    action = act.ActivateTab(i - 1),
  })
end


return config
