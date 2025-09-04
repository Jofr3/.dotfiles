local wezterm = require("wezterm")
local config = wezterm.config_builder()

config.window_padding = { left = 0, right = 0, top = 0, bottom = 0 }
config.use_fancy_tab_bar = false
config.show_new_tab_button_in_tab_bar = false
config.force_reverse_video_cursor = true
config.hide_tab_bar_if_only_one_tab = true
config.disable_default_key_bindings = true
config.tab_max_width = 100000
config.line_height = 0.9
config.font_size = 10
config.font = wezterm.font("FiraCodeNerdFontMono")
config.harfbuzz_features = { 'calt=0', 'clig=0', 'liga=0' }
config.colors = {
	background = "#282828",
	tab_bar = { background = "#282828" },
}
-- config.font = wezterm.font("BigBlueTerm437 Nerd Font Mono")
-- config.freetype_load_target = "Mono"
-- config.freetype_render_target = "Mono"
config.window_close_confirmation = "NeverPrompt"

function Tab_title(tab_info)
	local title = tab_info.tab_title
	if title and #title > 0 then
		return title
	end
	return tab_info.active_pane.title
end

function Basename(s)
	return string.gsub(s, "(.*[/\\])(.*)", "%2")
end

wezterm.on("format-tab-title", function(tab)
	local index = tab.tab_index + 1

	local pane = tab.active_pane
	local title = Basename(pane.foreground_process_name)
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

local HOME = wezterm.home_dir
local my_schema = {
	{ label = "default", id = "default" },
	sessionizer.FdSearch(HOME .. "/lsw"),
	HOME .. "/.dotfiles",
	HOME .. "/.dotfiles/config/nix",
	HOME .. "/.dotfiles/config/nvim",
	HOME .. "/.dotfiles/config/fish",
	HOME .. "/projects/sftp.nvim",
	HOME .. "/projects/needle",
	HOME .. "/Dropbox/notes",

	processing = sessionizer.for_each_entry(function(entry)
		entry.label = entry.label:gsub(HOME, "~")
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
		action = act.CloseCurrentTab({ confirm = false }),
	},
	{
		mods = "CTRL|SHIFT",
		key = "c",
		action = act.CopyTo("Clipboard"),
	},
	{
		mods = "CTRL|SHIFT",
		key = "v",
		action = act.PasteFrom("Clipboard"),
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
