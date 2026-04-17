from kitty.boss import get_boss
from kitty.fast_data_types import Screen
from kitty.tab_bar import (
    DrawData,
    ExtraData,
    TabBarData,
    as_rgb,
    color_as_int,
    draw_tab_with_separator,
)


def draw_tab(
    draw_data: DrawData,
    screen: Screen,
    tab: TabBarData,
    before: int,
    max_tab_length: int,
    index: int,
    is_last: bool,
    extra_data: ExtraData,
) -> int:
    if index == 1:
        sess = get_boss().active_session or "none"
        label = f" {sess} "
        orig_fg = screen.cursor.fg
        orig_bg = screen.cursor.bg
        screen.cursor.fg = as_rgb(color_as_int(draw_data.active_fg))
        screen.cursor.bg = as_rgb(color_as_int(draw_data.active_bg))
        screen.cursor.bold = True
        screen.draw(label)
        screen.cursor.bold = False
        screen.cursor.fg = orig_fg
        screen.cursor.bg = orig_bg
        before = screen.cursor.x
    return draw_tab_with_separator(
        draw_data, screen, tab, before, max_tab_length, index, is_last, extra_data
    )
