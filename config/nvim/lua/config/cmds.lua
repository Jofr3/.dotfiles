vim.api.nvim_create_autocmd("VimEnter", {
  pattern = "*",
  callback = function()
    vim.cmd("TSEnable highlight")
  end,
})

vim.api.nvim_create_user_command("GetFilePath", function()
  vim.cmd("let @+ = expand('%:p')")
end, {})

vim.api.nvim_create_user_command("UndoTree", function()
  vim.cmd("Telescope undo")
end, {})
