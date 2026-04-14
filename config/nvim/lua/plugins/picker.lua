local default_layout = {
  hidden = { "preview" },
  layout = {
    box = "vertical",
    backdrop = false,
    border = "single",
    width = 0.6,
    height = 0.8,
    { win = "input",   height = 1, border = "bottom" },
    { win = "list" },
    { win = "preview", border = "top" },
  },
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

require("snacks").setup({
  picker = {
    show_delay = 0,
    sources = {
      files = {
        layout = default_layout,
      },
      buffers = {
        layout = default_layout,
      },
      explorer = {
        auto_close = true,
        layout = default_layout,
      },
      commands = {
        layout = default_layout,
      },
      grep = {
        layout = preview_layout,
      },
      undo = {
        layout = preview_layout,
      },
      git_status = {
        layout = preview_layout,
        win = {
          input = {
            keys = {
              ["<A-s>"] = { "git_stage",   mode = { "i", "n" } },
              ["<A-r>"] = { "git_restore", mode = { "i", "n" } },
            },
          },
        },
      },
    },
    win = {
      input = {
        keys = {
          ["<A-q>"] = { "cancel",              mode = { "i", "n" } },
          ["<A-k>"] = { "list_up",             mode = { "i", "n" } },
          ["<A-j>"] = { "list_down",           mode = { "i", "n" } },
          ["<A-i>"] = { "toggle_hidden",       mode = { "i", "n" } },
          ["<A-p>"] = { "toggle_preview",      mode = { "i", "n" } },
          ["<A-l>"] = { "qflist",              mode = { "i", "n" } },
          ["<A-c>"] = { "edit_split",          mode = { "i", "n" } },
          ["<A-v>"] = { "edit_vsplit",         mode = { "i", "n" } },
          ["<C-u>"] = { "preview_scroll_up",   mode = { "i", "n" } },
          ["<C-d>"] = { "preview_scroll_down", mode = { "i", "n" } },
        },
      },
    },
  },
})

local snacks = require("snacks")
local map = vim.keymap.set

map("n", "<A-f>", snacks.picker.files)
map("n", "<A-b>", snacks.picker.buffers)
map("n", "<A-g>", snacks.picker.grep)
map("n", "<A-m>", snacks.picker.explorer)
map("n", "<A-u>", snacks.picker.undo)
map("n", "<A-x>", snacks.picker.commands)
map("n", "<space><space>", snacks.picker.resume)
map("n", "<A-d>", snacks.picker.git_status)
