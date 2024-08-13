local wezterm = require 'wezterm'

local config = wezterm.config_builder()

config.color_scheme = 'GruvboxDarkHard'
config.font = wezterm.font 'Fira Code'
config.font_size = 15

return config

