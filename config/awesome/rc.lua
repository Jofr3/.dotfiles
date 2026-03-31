-- Awesome WM - Gaming Configuration
-- Keybinds based on niri layout, Super as modifier

local awful = require("awful")
local gears = require("gears")
local wibox = require("wibox")
local beautiful = require("beautiful")
local naughty = require("naughty")
require("awful.autofocus")

-- Error handling
if awesome.startup_errors then
    naughty.notify({
        preset = naughty.config.presets.critical,
        title = "Startup error",
        text = awesome.startup_errors,
    })
end

do
    local in_error = false
    awesome.connect_signal("debug::error", function(err)
        if in_error then return end
        in_error = true
        naughty.notify({
            preset = naughty.config.presets.critical,
            title = "Error",
            text = tostring(err),
        })
        in_error = false
    end)
end

-- Rose Pine Moon colors
beautiful.init(gears.filesystem.get_themes_dir() .. "default/theme.lua")
beautiful.useless_gap = 0
beautiful.border_width = 0
beautiful.bg_normal = "#232136"
beautiful.bg_focus = "#393552"
beautiful.bg_urgent = "#eb6f92"
beautiful.fg_normal = "#e0def4"
beautiful.fg_focus = "#c4a7e7"
beautiful.fg_urgent = "#e0def4"
beautiful.taglist_bg_focus = "#c4a7e7"
beautiful.taglist_fg_focus = "#232136"
beautiful.font = "FiraCode Nerd Font 10"

-- Max layout first: each window fills the screen (ideal for gaming)
awful.layout.layouts = {
    awful.layout.suit.max,
    awful.layout.suit.tile,
    awful.layout.suit.floating,
}

local mod = "Mod4"
local terminal = "kitty"
local home = os.getenv("HOME")

-- Wallpaper
local function set_wallpaper(s)
    local wallpaper = home .. "/.dotfiles/config/nix/theme/wallpaper.jpg"
    if gears.filesystem.file_readable(wallpaper) then
        gears.wallpaper.maximized(wallpaper, s, true)
    end
end

screen.connect_signal("property::geometry", set_wallpaper)

-- Screen setup
awful.screen.connect_for_each_screen(function(s)
    set_wallpaper(s)

    awful.tag({ "1", "2", "3", "4", "5" }, s, awful.layout.suit.max)

    s.taglist = awful.widget.taglist {
        screen = s,
        filter = awful.widget.taglist.filter.all,
        buttons = gears.table.join(
            awful.button({}, 1, function(t) t:view_only() end)
        ),
    }

    -- Bar hidden by default, toggle with Super+B
    s.wibar = awful.wibar({ position = "top", screen = s, height = 24, visible = false })
    s.wibar:setup {
        layout = wibox.layout.align.horizontal,
        s.taglist,
        nil,
        wibox.widget.textclock(" %H:%M "),
    }
end)

-- Global keybindings (niri-style)
local globalkeys = gears.table.join(
    -- Close window (niri: Mod+Q)
    awful.key({ mod }, "q", function()
        if client.focus then client.focus:kill() end
    end, { description = "close window", group = "window" }),

    -- Focus left/right (niri: Mod+H/L)
    awful.key({ mod }, "h", function() awful.client.focus.bydirection("left") end,
        { description = "focus left", group = "focus" }),
    awful.key({ mod }, "l", function() awful.client.focus.bydirection("right") end,
        { description = "focus right", group = "focus" }),

    -- Previous/next tag (niri: Mod+J/K for workspace up/down)
    awful.key({ mod }, "j", function() awful.tag.viewprev() end,
        { description = "previous tag", group = "tag" }),
    awful.key({ mod }, "k", function() awful.tag.viewnext() end,
        { description = "next tag", group = "tag" }),

    -- Swap client left/right (niri: Mod+Shift+H/L)
    awful.key({ mod, "Shift" }, "h", function() awful.client.swap.bydirection("left") end,
        { description = "swap left", group = "window" }),
    awful.key({ mod, "Shift" }, "l", function() awful.client.swap.bydirection("right") end,
        { description = "swap right", group = "window" }),

    -- Move to previous/next tag (niri: Mod+Shift+J/K)
    awful.key({ mod, "Shift" }, "j", function()
        if not client.focus then return end
        local idx = awful.tag.getidx()
        if idx and idx > 1 then
            client.focus:move_to_tag(client.focus.screen.tags[idx - 1])
            awful.tag.viewprev()
        end
    end, { description = "move to previous tag", group = "tag" }),

    awful.key({ mod, "Shift" }, "k", function()
        if not client.focus then return end
        local tags = client.focus.screen.tags
        local idx = awful.tag.getidx()
        if idx and idx < #tags then
            client.focus:move_to_tag(tags[idx + 1])
            awful.tag.viewnext()
        end
    end, { description = "move to next tag", group = "tag" }),

    -- Terminal (niri: Mod+Return)
    awful.key({ mod }, "Return", function() awful.spawn(terminal) end,
        { description = "terminal", group = "launcher" }),

    -- App launcher via rofi (niri: Mod+O)
    awful.key({ mod }, "o", function() awful.spawn("rofi -show drun -show-icons") end,
        { description = "app launcher", group = "launcher" }),

    -- Brightness (niri: Mod+Left/Right)
    awful.key({ mod }, "Left", function() awful.spawn("brightnessctl set 5%-") end,
        { description = "brightness down", group = "system" }),
    awful.key({ mod }, "Right", function() awful.spawn("brightnessctl set +5%") end,
        { description = "brightness up", group = "system" }),

    -- Volume (niri: Mod+Up/Down)
    awful.key({ mod }, "Up", function() awful.spawn("pactl set-sink-volume @DEFAULT_SINK@ +5%") end,
        { description = "volume up", group = "system" }),
    awful.key({ mod }, "Down", function() awful.spawn("pactl set-sink-volume @DEFAULT_SINK@ -5%") end,
        { description = "volume down", group = "system" }),

    -- Toggle bar
    awful.key({ mod }, "b", function()
        local s = awful.screen.focused()
        s.wibar.visible = not s.wibar.visible
    end, { description = "toggle bar", group = "system" }),

    -- Cycle layout (niri: Mod+Space for overview, here cycles max/tile/float)
    awful.key({ mod }, "space", function() awful.layout.inc(1) end,
        { description = "next layout", group = "layout" }),

    -- Restart awesome
    awful.key({ mod, "Shift" }, "r", awesome.restart,
        { description = "reload awesome", group = "awesome" })
)

-- Tag keybindings 1-5 (niri: Mod+1-5 for focus-column)
for i = 1, 5 do
    globalkeys = gears.table.join(globalkeys,
        awful.key({ mod }, "#" .. i + 9, function()
            local tag = awful.screen.focused().tags[i]
            if tag then tag:view_only() end
        end, { description = "view tag " .. i, group = "tag" }),

        awful.key({ mod, "Shift" }, "#" .. i + 9, function()
            if client.focus then
                local tag = client.focus.screen.tags[i]
                if tag then client.focus:move_to_tag(tag) end
            end
        end, { description = "move to tag " .. i, group = "tag" })
    )
end

root.keys(globalkeys)

-- Client keybindings
local clientkeys = gears.table.join(
    -- Fullscreen (niri: Mod+F)
    awful.key({ mod }, "f", function(c)
        c.fullscreen = not c.fullscreen
        c:raise()
    end, { description = "toggle fullscreen", group = "window" }),

    -- Maximize
    awful.key({ mod }, "m", function(c)
        c.maximized = not c.maximized
        c:raise()
    end, { description = "toggle maximize", group = "window" })
)

-- Client mouse bindings (Super+drag to move/resize, like niri/hyprland)
local clientbuttons = gears.table.join(
    awful.button({}, 1, function(c)
        c:emit_signal("request::activate", "mouse_click", { raise = true })
    end),
    awful.button({ mod }, 1, function(c)
        c:emit_signal("request::activate", "mouse_click", { raise = true })
        awful.mouse.client.move(c)
    end),
    awful.button({ mod }, 3, function(c)
        c:emit_signal("request::activate", "mouse_click", { raise = true })
        awful.mouse.client.resize(c)
    end)
)

-- Rules
awful.rules.rules = {
    -- Defaults: no borders, no size hints (prevents games from being constrained)
    {
        rule = {},
        properties = {
            border_width = 0,
            focus = awful.client.focus.filter,
            raise = true,
            keys = clientkeys,
            buttons = clientbuttons,
            screen = awful.screen.preferred,
            placement = awful.placement.no_overlap + awful.placement.no_offscreen,
            size_hints_honor = false,
        },
    },
    -- Rofi
    {
        rule_any = { class = { "Rofi" } },
        properties = { floating = true },
    },
    -- Steam on tag 2
    {
        rule_any = { class = { "Steam", "steam" } },
        properties = { tag = "2" },
    },
    -- Lutris on tag 2
    {
        rule_any = { class = { "Lutris", "lutris" } },
        properties = { tag = "2" },
    },
    -- Game windows fullscreen on tag 1
    {
        rule_any = { class = { "gamescope" } },
        properties = { fullscreen = true, tag = "1" },
    },
    -- Wine/Proton games (class starts with steam_app_)
    {
        rule = {},
        callback = function(c)
            if c.class and c.class:match("^steam_app_") then
                c.fullscreen = true
                c:move_to_tag(c.screen.tags[1])
                c:raise()
            end
        end,
    },
}

-- No titlebars
client.connect_signal("request::titlebars", function() end)

-- Prevent Wine/Proton games from being minimized/hidden (breaks rendering)
client.connect_signal("property::minimized", function(c)
    if c.class and c.class:match("^steam_app_") then
        c.minimized = false
    end
end)

-- XKB: caps as escape, dual layout (matching hyprland config)
awful.spawn.with_shell("setxkbmap -layout us,ca -option caps:escape")

-- Monitor: 144Hz (matching hyprland config)
awful.spawn.with_shell("xrandr --output DisplayPort-0 --mode 1920x1080 --rate 144")

-- Compositor (needed for Wine/Proton game rendering)
awful.spawn.with_shell("picom --backend glx &")
