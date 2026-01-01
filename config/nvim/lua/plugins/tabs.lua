return {
  "akinsho/bufferline.nvim",
  version = "*",
  enabled = true,
  lazy    = false,
  config  = function()
    local bufferline = require('bufferline')
    bufferline.setup {
      options = {
        style_preset = {
          bufferline.style_preset.minimal,
          bufferline.style_preset.no_bold
        },
        buffer_close_icon = '',
        modified_icon = '',
        close_icon = '',
        left_trunc_marker = '',
        right_trunc_marker = '',
        diagnostics = false,
        sort_by = "extension",
        always_show_bufferline = false,
        tab_size = 15,
      }
    }
  end,
  keys    = function()
    local builtin = require("telescope.builtin")
    return {
      { mode = "n", "<A-f>", builtin.buffers },
    }
  end
}
