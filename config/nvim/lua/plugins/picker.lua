return {
  "folke/snacks.nvim",
  enabled = true,
  lazy = false,
  opts = function()
    local default_layout = {
      hidden = { "preview" },
      layout = {
        box = "vertical",
        backdrop = false,
        border = "single",
        width = 0.6,
        height = 0.8,
        { win = "input",   height = 1,    border = "bottom" },
        { win = "list" },
        { win = "preview", border = "top" },
      }
    }

    local preview_layout = {
      layout = {
        box = "horizontal",
        backdrop = false,
        width = 0.9,
        height = 0.8,
        border = "single",
        {
          box = "vertical",
          { win = "input", height = 1, border = "bottom" },
          { win = "list" },
        },
        { win = "preview", border = "left", width = 0.5 },
      },
    }

    return {
      picker = {
        show_delay = 0,
        sources = {
          files = {
            hidden = true,
            layout = default_layout,
          },
          buffers = {
            layout = default_layout,
          },
          explorer = {
            auto_close = true,
            layout = default_layout,
          },
          grep = {
            layout = preview_layout,
          },
          undo = {
            layout = preview_layout,
          }
        },
      }
    }
  end,
  keys = function()
    local snacks = require("snacks")
    return {
      { mode = "n", "<A-f>",          snacks.picker.files },
      { mode = "n", "<A-b>",          snacks.picker.buffers },
      { mode = "n", "<A-g>",          snacks.picker.grep },
      { mode = "n", "<A-m>",          snacks.picker.explorer },
      { mode = "n", "<A-u>",          snacks.picker.undo },
      { mode = "n", "<space><space>", snacks.picker.resume },
    }
  end
}
