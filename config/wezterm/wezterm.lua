local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- config.default_cursor_style = "SteadyBar"
config.window_padding = { left = 0, right = 0, top = 0, bottom = 0 }
config.use_fancy_tab_bar = false
config.show_new_tab_button_in_tab_bar = false
-- config.force_reverse_video_cursor = true
config.hide_tab_bar_if_only_one_tab = true
config.disable_default_key_bindings = true
config.tab_max_width = 100000
config.font_size = 11
config.font = wezterm.font 'FiraCodeNerdFontMono'
config.colors = {
	background = "#282828",
  cursor_fg = "#928374",
  cursor_bg = "#928374",
	tab_bar = { background = "#282828" }
}
config.window_close_confirmation = 'NeverPrompt'

function Tab_title(tab_info)
	local title = tab_info.tab_title
	if title and #title > 0 then
		return title
	end
	return tab_info.active_pane.title
end

wezterm.on("format-tab-title", function(tab)
	local title = Tab_title(tab)
	local index = tab.tab_index + 1
	if tab.is_active then
		return {
			{ Background = { Color = "#3C3836" } },
			{ Text = " " .. index .. ": " .. title .. " " },
		}
	else
		return {
			{ Background = { Color = "#282828" } },
			{ Text = " " .. index .. ": " .. title .. " " },
		}
	end
end)

local sessionizer = wezterm.plugin.require("https://github.com/mikkasendke/sessionizer.wezterm")

local my_schema = {
	{ label = "default", id = "default" },
	sessionizer.FdSearch(wezterm.home_dir .. "/lsw"),
	sessionizer.FdSearch(wezterm.home_dir .. "/.dotfiles/config"),
	wezterm.home_dir .. "/nix",
	wezterm.home_dir .. "/.dotfiles",
	wezterm.home_dir .. "/Dropbox/notes",

	processing = sessionizer.for_each_entry(function(entry)
		entry.label = entry.label:gsub(wezterm.home_dir, "~")
	end),
}

local act = wezterm.action

config.keys = {
	{
		mods = "SUPER",
		key = "Enter",
		action = act.SpawnTab("CurrentPaneDomain"),
	},
	{
		mods = "SUPER",
		key = "c",
		action = wezterm.action.CloseCurrentTab({ confirm = false }),
	},
	{
		mods = "SUPER",
		key = "f",
		action = sessionizer.show(my_schema),
	},
}

for i = 1, 8 do
	table.insert(config.keys, {
		key = tostring(i),
		mods = "SUPER",
		action = act.ActivateTab(i - 1),
	})
end

return config
