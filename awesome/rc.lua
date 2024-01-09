-- If LuaRocks is installed, make sure that packages installed through it are
-- found (e.g. lgi). If LuaRocks is not installed, do nothing.
pcall(require, "luarocks.loader")

-- Standard awesome library
local gears = require("gears")
local awful = require("awful")
require("awful.autofocus")
-- Widget and layout library
local wibox = require("wibox")
-- Theme handling library
local beautiful = require("beautiful")
-- Notification library
local naughty = require("naughty")
local menubar = require("menubar")
local hotkeys_popup = require("awful.hotkeys_popup")
-- Enable hotkeys help widget for VIM and other apps
-- when client with a matching name is opened:
require("awful.hotkeys_popup.keys")

-- Error handling
if awesome.startup_errors then
    naughty.notify({
        preset = naughty.config.presets.critical,
        title = "Oops, there were errors during startup!",
        text = awesome.startup_errors
    })
end

do
    local in_error = false
    awesome.connect_signal("debug::error", function(err)
        if in_error then return end
        in_error = true

        naughty.notify({
            preset = naughty.config.presets.critical,
            title = "Oops, an error happened!",
            text = tostring(err)
        })
        in_error = false
    end)
end

beautiful.init(gears.filesystem.get_themes_dir() .. "default/theme.lua")

terminal = "kitty"
editor = "nvim"
editor_cmd = terminal .. " -e " .. editor
modkey = "Mod4"

awful.layout.layouts = {
    -- awful.layout.suit.max,
    awful.layout.suit.floating,
    -- awful.layout.suit.spiral.dwindle,
}

mymainmenu = awful.menu({
    items = { { "awesome", beautiful.awesome_icon },
        { "open terminal", terminal }
    }
})

-- Menubar configuration
menubar.utils.terminal = terminal -- Set the terminal for applications that require it
-- }}}

-- Keyboard map indicator and switcher
mykeyboardlayout = awful.widget.keyboardlayout()

-- {{{ Wibar
-- Create a textclock widget
mytextclock = wibox.widget.textclock()

-- Create a wibox for each screen and add it
local taglist_buttons = gears.table.join(
    awful.button({}, 1, function(t) t:view_only() end),
    awful.button({ modkey }, 1, function(t)
        if client.focus then
            client.focus:move_to_tag(t)
        end
    end)
)

local tasklist_buttons = gears.table.join(
    awful.button({}, 4, function()
        awful.client.focus.byidx(1)
    end),
    awful.button({}, 5, function()
        awful.client.focus.byidx(-1)
    end)
)

awful.screen.connect_for_each_screen(function(s)
    gears.wallpaper.maximized('/home/jofre/Documents/wallpapers/1.jpg', s)

    awful.tag({ "1", "2", "3", "4", "5", "6" }, s, awful.layout.layouts[1])

    -- Create a promptbox for each screen
    s.mypromptbox = awful.widget.prompt()
    -- Create an imagebox widget which will contain an icon indicating which layout we're using.
    -- We need one layoutbox per screen.
    s.mylayoutbox = awful.widget.layoutbox(s)
    s.mylayoutbox:buttons(gears.table.join(
        awful.button({}, 1, function() awful.layout.inc(1) end),
        awful.button({}, 3, function() awful.layout.inc(-1) end),
        awful.button({}, 4, function() awful.layout.inc(1) end),
        awful.button({}, 5, function() awful.layout.inc(-1) end)))
    -- Create a taglist widget
    s.mytaglist = awful.widget.taglist {
        screen  = s,
        filter  = awful.widget.taglist.filter.all,
        buttons = taglist_buttons
    }

    -- Create a tasklist widget
    s.mytasklist = awful.widget.tasklist {
        screen  = s,
        filter  = awful.widget.tasklist.filter.currenttags,
        buttons = tasklist_buttons
    }

    -- Create the wibox
    s.mywibox = awful.wibar({ position = "top", screen = s, visible = false, ontop = true })

    -- Add widgets to the wibox
    s.mywibox:setup {
        layout = wibox.layout.align.horizontal,
        {
            -- Left widgets
            layout = wibox.layout.fixed.horizontal,
            s.mytaglist,
            s.mypromptbox,
        },
        s.mytasklist, -- Middle widget
        {
            -- Right widgets
            layout = wibox.layout.fixed.horizontal,
            -- mykeyboardlayout,
            wibox.widget.systray(),
            mytextclock,
            s.mylayoutbox,
        },
    }
end)
-- }}}

-- {{{ Key bindings
globalkeys = gears.table.join(
    awful.key({ modkey }, "j", awful.tag.viewprev, { description = "Move to left workspace", group = "Movement" }),
    awful.key({ modkey }, ";", awful.tag.viewnext, { description = "Move to right workspace", group = "Movement" }),
    awful.key({ modkey }, "o", awful.tag.history.restore,
        { description = "Go to previous workspace", group = "Movement" }),
    awful.key({ modkey }, "s", hotkeys_popup.show_help, { description = "Show keybindings", group = "Other" }),
    awful.key({ modkey, "Shift" }, "k", function() awful.client.swap.byidx(1) end,
        { description = "Swap with left window", group = "Windows" }),
    awful.key({ modkey, "Shift" }, "l", function() awful.client.swap.byidx(-1) end,
        { description = "swap with right window", group = "Windows" }),
    awful.key({ modkey, "Shift" }, "j", function() awful.screen.focus_relative(1) end,
        { description = "focus the next screen", group = "Windows" }),
    awful.key({ modkey, "Shift" }, ";", function() awful.screen.focus_relative(-1) end,
        { description = "focus the previous screen", group = "Windows" }),
    awful.key({ modkey }, "u", awful.client.urgent.jumpto, { description = "Jump to urgent window", group = "Windows" }),
    awful.key({ modkey, "Shift" }, "n",
        function()
            local c = awful.client.restore()
            -- Focus restored client
            if c then
                c:emit_signal(
                    "request::activate", "key.unminimize", { raise = true }
                )
            end
        end,
        { description = "Restore minimized window", group = "Windows" }),

    awful.key({ modkey }, "Tab",
        function()
            awful.client.focus.history.previous()
            if client.focus then
                client.focus:raise()
            end
        end,
        { description = "Cycle windows", group = "Windows" }),
    awful.key({ modkey }, "Return", function() awful.spawn(terminal) end,
        { description = "Open a terminal", group = "Apps" }),
    awful.key({ modkey }, "q", function() awful.screen.focused().mypromptbox:run() end,
        { description = "Run prompt", group = "Apps" }),
    awful.key({ modkey }, "p", function() menubar.show() end, { description = "App launcher", group = "Apps" }),
    awful.key({ modkey, "Shift" }, "r", awesome.restart, { description = "Reload awesome", group = "System" }),
    awful.key({ modkey }, "b", function() awful.layout.inc(1) end,
        { description = "Select next layout", group = "System" }),

    awful.key({ modkey }, "i", function(c)
            for s in screen do
                s.mywibox.visible = not s.mywibox.visible
            end
        end,
        { description = "Toggle wibar", group = "System" }),

    awful.key({}, "#232", function() awful.util.spawn("brightnessctl set 10%-") end),
    awful.key({}, "#233", function() awful.util.spawn("brightnessctl set +10%") end)
)

clientkeys = gears.table.join(
    awful.key({ modkey }, "c", function(c) c:kill() end, { description = "Close window", group = "Windows" }),
    awful.key({ modkey, }, "t", function(c) c.ontop = not c.ontop end,
        { description = "Keep window on top", group = "Windows" }),
    awful.key({ modkey, }, "n", function(c) c.minimized = true end,
        { description = "Minimize window", group = "Windows" }),
    awful.key({ modkey, }, "m", function(c)
        c.maximized = not c.maximized
        c:raise()
    end, { description = "Maximize window", group = "Windows" })
)

for i = 1, 9 do
    globalkeys = gears.table.join(globalkeys,
        awful.key({ modkey }, "#" .. i + 9,
            function()
                local screen = awful.screen.focused()
                local tag = screen.tags[i]
                if tag then
                    tag:view_only()
                end
            end,
            { description = "view tag #" .. i, group = "tag" }),

        awful.key({ modkey, "Shift" }, "#" .. i + 9,
            function()
                if client.focus then
                    local tag = client.focus.screen.tags[i]
                    if tag then
                        client.focus:move_to_tag(tag)
                    end
                end
            end,
            { description = "move focused client to tag #" .. i, group = "tag" })
    )
end

clientbuttons = gears.table.join(
    awful.button({ modkey }, 1, function(c)
        c:emit_signal("request::activate", "mouse_click", { raise = true })
        awful.mouse.client.move(c)
    end)
)

root.keys(globalkeys)

-- Rules
awful.rules.rules = {

    {
        rule = {},
        properties = {
            border_width = 0,
            border_color = 0,
            focus = awful.client.focus.filter,
            raise = true,
            keys = clientkeys,
            buttons = clientbuttons,
            screen = awful.screen.preferred,
            placement = awful.placement.no_overlap + awful.placement.no_offscreen + awful.placement.centered
        }
    }
}

-- {{{ Signals
-- Signal function to execute when a new client appears.
client.connect_signal("manage", function(c)
    -- Set the windows at the slave,
    -- i.e. put it at the end of others instead of setting it master.
    -- if not awesome.startup then awful.client.setslave(c) end

    if awesome.startup
        and not c.size_hints.user_position
        and not c.size_hints.program_position then
        -- Prevent clients from being unreachable after screen count changes.
        awful.placement.no_offscreen(c)
    end
end)

-- Enable sloppy focus, so that focus follows mouse.
client.connect_signal("mouse::enter", function(c)
    c:emit_signal("request::activate", "mouse_enter", { raise = false })
end)

client.connect_signal("focus", function(c) c.border_color = beautiful.border_focus end)
client.connect_signal("unfocus", function(c) c.border_color = beautiful.border_normal end)
-- }}}

awful.spawn.with_shell("picom --config ~/.config/picom/picom.conf")
