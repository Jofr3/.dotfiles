return {
	{
		"akinsho/toggleterm.nvim",
		enabled = true,
		lazy = false,
		version = "*",
		opts = {
			direction = "float",
			close_on_exit = false,
      float_opts = {
          width = 150,
          height = 43,
      }
		},
		init = function()
			vim.keymap.set("t", "<Esc>", "<C-\\><C-n>")

			vim.api.nvim_create_autocmd({ "WinEnter", "BufWinEnter", "TermOpen" }, {
				callback = function(args)
					if vim.startswith(vim.api.nvim_buf_get_name(args.buf), "term://") then
						vim.cmd("startinsert")
					end
				end,
			})
		end,
		keys = {
			{ mode = { "n", "t" }, "<A-Enter>", "<cmd>ToggleTerm<cr>" },
			{ mode = { "n", "t" }, "<leader>tn", "<cmd>terminal<cr>" },
			{ mode = { "n", "t" }, "<leader>tx", "<cmd>split | terminal<cr>" },
			{ mode = { "n", "t" }, "<leader>tv", "<cmd>vsplit | terminal<cr>" },
		},
	},
}
