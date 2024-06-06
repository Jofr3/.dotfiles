-- Disables comment continuation
vim.api.nvim_create_autocmd("FileType", {
    pattern = "*",
    callback = function()
        vim.opt_local.formatoptions:remove({ "c", "r", "o" })
    end,
})

-- vim.api.nvim_create_autocmd({ "CmdlineLeave", "BufLeave" }, {
-- 	callback = function()
-- 		vim.fn.timer_start(2500, function()
-- 			vim.cmd([[echon ' ']])
-- 		end)
-- 	end,
-- })

vim.api.nvim_create_autocmd("FileType", {
    pattern = "oil",
    callback = function()
        vim.opt_local.number = false
        vim.opt_local.relativenumber = false
    end,
})

vim.api.nvim_create_autocmd("VimEnter", {
    callback = function()
        require("nvim-tree.api").tree.toggle({ focus = false })
    end,
})

vim.api.nvim_create_autocmd("BufEnter", {
    nested = true,
    callback = function()
    if #vim.api.nvim_list_wins() == 1 and require("nvim-tree.utils").is_nvim_tree_buf() then
      vim.cmd "quit"
    end
  end
})
