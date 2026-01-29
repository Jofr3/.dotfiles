vim.api.nvim_create_autocmd("VimEnter", {
  pattern = "*",
  callback = function()
    vim.cmd("TSEnable highlight")
  end,
})


math.randomseed(vim.loop.hrtime())

local function short_id()
  return ('xxxxxxxxxxxx'):gsub('x', function()
    return string.format('%x', math.random(0, 15))
  end)
end


-- Comand pallet

vim.api.nvim_create_user_command("CopyFilePath", function()
  vim.cmd("let @+ = expand('%:p')")
end, {})

vim.api.nvim_create_user_command("NewNote", function()
  vim.api.nvim_put({ short_id() .. ".md" }, 'c', true, true)
end, {})

vim.api.nvim_create_user_command("FileGitLog", function()
  require("snacks").picker.git_log_file()
end, {})
