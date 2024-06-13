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
