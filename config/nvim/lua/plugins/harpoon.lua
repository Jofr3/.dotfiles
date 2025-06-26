return {
	"Jofr3/harpoon",
	dependencies = { "nvim-lua/plenary.nvim" },
	branch = "harpoon2",
	enabled = true,
	lazy = false,
	config = function()
		local harpoon = require("harpoon")

		harpoon:setup({
			settings = {
				save_on_toggle = true,
				sync_on_ui_close = true,
			},
		})

		harpoon:extend({
			UI_CREATE = function(cx)
				for i = 1, 9 do
					  vim.keymap.set("n", "" .. i, function()
						harpoon:list(cx.active_list.name):select(i)
					end, { buffer = cx.bufnr })
				end
			end,
		})

		vim.keymap.set("n", "<A-1>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list("1"))
		end)
		vim.keymap.set("n", "<A-2>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list("2"))
		end)
		vim.keymap.set("n", "<A-3>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list("3"))
		end)
		vim.keymap.set("n", "<A-4>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list("4"))
		end)

		vim.keymap.set("n", "<Leader>1", function()
			harpoon:list("1"):add()
		end)
		vim.keymap.set("n", "<Leader>2", function()
			harpoon:list("2"):add()
		end)
		vim.keymap.set("n", "<Leader>3", function()
			harpoon:list("3"):add()
		end)
		vim.keymap.set("n", "<Leader>4", function()
			harpoon:list("4"):add()
		end)
	end,
}
