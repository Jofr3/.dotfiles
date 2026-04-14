-- fugitive commands
vim.api.nvim_create_user_command("GitBlame", function()
  vim.cmd("Git blame")
end, {})

vim.api.nvim_create_user_command("GitLog", function()
  vim.cmd("Git log")
end, {})

vim.api.nvim_create_user_command("GitLogThis", function()
  vim.cmd("Git log -- " .. vim.fn.expand("%:p"))
end, {})

vim.api.nvim_create_user_command("GitLogLines", function(opts)
  local filepath = vim.fn.expand("%:p")
  if filepath ~= "" then
    vim.cmd(string.format("Git log --no-patch -L%d,%d:%s", opts.line1, opts.line2, filepath))
  else
    print("No file in current buffer")
  end
end, { range = true })

vim.api.nvim_create_user_command("GitDiff", function()
  vim.cmd("Gdiff")
end, {})

-- gitsigns
local gitsigns = require("gitsigns")
gitsigns.setup({
  signcolumn = false,
})

vim.api.nvim_create_user_command("GitPreviewHunk", function()
  vim.cmd("Gitsigns preview_hunk_inline")
end, {})

vim.api.nvim_create_user_command("GitResetHunk", function()
  vim.cmd("Gitsigns reset_hunk")
end, {})

vim.api.nvim_create_user_command("GitChanges", function()
  gitsigns.setqflist("all", nil)
end, {})

vim.api.nvim_create_user_command("GitChangesThis", function()
  gitsigns.setqflist("attached", nil)
end, {})

vim.keymap.set("n", "[h", function() gitsigns.nav_hunk("next") end)
vim.keymap.set("n", "]h", function() gitsigns.nav_hunk("prev") end)

-- mini.diff
local diff = require("mini.diff")
diff.setup({
  mappings = {
    apply = "",
    reset = "",
    textobject = "",
    goto_first = "",
    goto_prev = "",
    goto_next = "",
    goto_last = "",
  },
  view = {
    style = "sign",
    signs = { add = "░", change = "░", delete = "░" },
  },
})

vim.api.nvim_create_user_command("GitDiffOverlay", function()
  diff.toggle_overlay()
end, {})
