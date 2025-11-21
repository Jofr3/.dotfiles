vim.api.nvim_create_autocmd("VimEnter", {
  pattern = "*",
  callback = function()
    vim.cmd("TSEnable highlight")
  end,
})

vim.api.nvim_create_user_command('FileBranchGitDiff', function(opts)
  vim.cmd("AdvancedGitSearch diff_branch_file")
end, {})

vim.api.nvim_create_user_command('LineGitHistory', function(opts)
  vim.cmd("'<,'>AdvancedGitSearch diff_commit_line")
end, { range = true })

vim.api.nvim_create_user_command('FileGitHistory', function(opts)
  vim.cmd("AdvancedGitSearch diff_commit_file")
end, {})
