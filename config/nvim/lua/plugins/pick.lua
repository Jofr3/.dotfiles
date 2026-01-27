return {
  'nvim-mini/mini.pick',
  enabled = true,
  lazy = false,
  opts = {
    options = {
      use_cache = true,
    },
    window = {
      config = function()
        local height = math.floor(0.7 * vim.o.lines)
        local width = math.floor(0.7 * vim.o.columns)
        return {
          anchor = 'NW',
          height = height,
          width = width,
          row = math.floor(0.45 * (vim.o.lines - height)),
          col = math.floor(0.5 * (vim.o.columns - width)),
        }
      end,
      prompt_caret = '▏',
      prompt_prefix = ' ',
    },
  },
  keys = function()
    local pick = require("mini.pick")
    return {
      { mode = "n", "<A-b>", pick.builtin.files },
    }
  end
}
