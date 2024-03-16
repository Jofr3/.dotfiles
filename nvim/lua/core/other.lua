vim.cmd([[autocmd FileType markdown setlocal colorcolumn=93]])
vim.cmd([[autocmd FileType markdown setlocal textwidth=90]])

vim.api.nvim_create_autocmd("FileType", {
  pattern = "*",
  callback = function()
    vim.opt_local.formatoptions:remove({ 'c', 'r', 'o' })
  end,
})
