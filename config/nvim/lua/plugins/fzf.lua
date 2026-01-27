return {
  "ibhagwan/fzf-lua",
  opts = {
    globals = {
      fzf_bin = 'fzy',
    }
  },
  keys = function()
    local fzf = require("fzf-lua")
    return {
      -- { mode = "n", "<A-b>", fzf.files },
    }
  end
}
