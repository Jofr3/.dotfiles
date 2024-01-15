from libqtile import bar, layout, widget
from libqtile.config import Click, Drag, Group, Key, Match, Screen
from libqtile.lazy import lazy
from libqtile.utils import guess_terminal

mod = "mod4"
terminal = "kitty"

keys = [
    # Toggle bar
    Key([mod], "i", lazy.hide_show_bar(), desc="Toggles the bar"),

    # Cycle tru windows
    Key([mod], "Tab", lazy.layout.next(), desc="Cycle tru windows"),

    # Toggle floating window
    Key([mod], "w", lazy.window.toggle_floating(), desc="Toggle floating window"),

    # Launch terminal
    Key([mod], "Return", lazy.spawn(terminal), desc="Launch terminal"),

    # Kill window
    Key([mod], "c", lazy.window.kill(), desc="Kill window"),

    # Reload config
    Key([mod], "r", lazy.reload_config(), desc="Reload the config"),

    # Program launcher
    Key([mod], "space", lazy.spawncmd(), desc="Spawn a command"),

    # File explorer
    Key([mod], "n", lazy.spawn("nautilus"), desc="Launch nautilus"),
    
    # Backlight
    Key([mod], "g", lazy.spawn("brightnessctl set 5%-"), desc="Dec brightness"),
    Key([mod], "h", lazy.spawn("brightnessctl set +5%"), desc="Inc brightness"),

    # Color picker
    Key([mod], "y", lazy.spawn("gpick -p -s -o | xsel -b", shell=True), desc="Color picker"),
]


groups = [Group(i) for i in "12345678"]

for i in groups:
    keys.extend(
        [
            # mod1 + letter of group = switch to group
            Key(
                [mod],
                i.name,
                lazy.group[i.name].toscreen(),
                desc="Switch to group {}".format(i.name),
            ),
            # mod1 + shift + letter of group = switch to & move focused window to group
            Key(
                [mod, "shift"],
                i.name,
                lazy.window.togroup(i.name, switch_group=True, toggle=True),
                desc="Switch to & move focused window to group {}".format(i.name),
            ),
            # Or, use below if you prefer not to switch to that group.
            # # mod1 + shift + letter of group = move focused window to group
            # Key([mod, "shift"], i.name, lazy.window.togroup(i.name),
            #     desc="move focused window to group {}".format(i.name)),
        ]
    )

layouts = [
    # layout.Columns(border_focus_stack=["#d75f5f", "#8f3d3d"], border_width=4),
    layout.Max(),
    # Try more layouts by unleashing below layouts.
    # layout.Stack(num_stacks=2),
    # layout.Bsp(),
    # layout.Matrix(),
    # layout.MonadTall(),
    # layout.MonadWide(),
    # layout.RatioTile(),
    # layout.Tile(),
    # layout.TreeTab(),
    # layout.VerticalTile(),
    # layout.Zoomy(),
]

widget_defaults = dict(
    font="Jet Brains Mono",
    fontsize=12,
    padding=3,
)

extension_defaults = widget_defaults.copy()

screens = [
    Screen(
        wallpaper='~/.dotfiles/wallpapers/12.jpg',
        wallpaper_mode='fill',
        top=bar.Bar(
            [
                widget.CurrentLayout(),
                widget.Sep(foreground="ffffff", size_percent=75, padding=15),
                widget.KeyboardLayout(configured_keyboards=['us']),
                widget.Prompt(),
                widget.Spacer(),
                widget.GroupBox(this_current_screen_border="ffffff", urgent_border="000000", use_mouse_wheel=False, borderwidth=2),
                widget.Spacer(),
                widget.Systray(),
                widget.Clock(format="%a %d/%m/%Y %I:%M %p"),
                widget.Sep(foreground="ffffff", size_percent=75, padding=15),
                widget.Battery(charge_char="▲", discharge_char="▼", format="{char} {percent:.0%}", update_delay=10),
            ],
            24,
        ),
    ),
]

# Drag floating layouts.
mouse = [
    Drag([mod], "Button1", lazy.window.set_position_floating(), start=lazy.window.get_position()),
    Drag([mod], "Button3", lazy.window.set_size_floating(), start=lazy.window.get_size()),
    Click([mod], "Button2", lazy.window.bring_to_front()),
]

dgroups_key_binder = None
dgroups_app_rules = []  # type: list
follow_mouse_focus = True
bring_front_click = False
cursor_warp = False
floating_layout = layout.Floating(
    border_width=2,
    border_focus="#ffffff",
    border_normal="#000000",
    float_rules=[
        # Run the utility of `xprop` to see the wm class and name of an X client.
        *layout.Floating.default_float_rules,
        # Match(wm_class="confirmreset"),  # gitk
        # Match(wm_class="makebranch"),  # gitk
        # Match(wm_class="maketag"),  # gitk
        # Match(wm_class="ssh-askpass"),  # ssh-askpass
        Match(wm_class="org.gnome.Nautilus"),  # nautilus
        # Match(title="branchdialog"),  # gitk
        # Match(title="pinentry"),  # GPG key password entry
    ]
)
auto_fullscreen = False
focus_on_window_activation = "smart"
reconfigure_screens = True

# If things like steam games want to auto-minimize themselves when losing
# focus, should we respect this or not?
auto_minimize = True

# When using the Wayland backend, this can be used to configure input devices.
wl_input_rules = None

# XXX: Gasp! We're lying here. In fact, nobody really uses or cares about this
# string besides java UI toolkits; you can see several discussions on the
# mailing lists, GitHub issues, and other WM documentation that suggest setting
# this string if your java app doesn't work correctly. We may as well just lie
# and say that we're a working one by default.
#
# We choose LG3D to maximize irony: it is a 3D non-reparenting WM written in
# java that happens to be on java's whitelist.
wmname = "LG3D"

# autostart
import os
import subprocess

from libqtile import hook

@hook.subscribe.startup_once
def autostart():
    home = os.path.expanduser('~/dotfiles/qtile/autostart.sh')
    subprocess.Popen([home])
