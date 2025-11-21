return {
	"Jofr3/harpoon",
	dependencies = { "nvim-lua/plenary.nvim" },
	branch = "harpoon2",
	enabled = false,
	lazy = false,
	config = function()
		local harpoon = require("harpoon")

		harpoon:setup({
			settings = {
				save_on_toggle = true,
				sync_on_ui_close = true,
			},
		})

		vim.keymap.set("n", "<A-!>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list("1"))
		end)
		vim.keymap.set("n", "<A-@>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list("2"))
		end)
		vim.keymap.set("n", "<A-#>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list("3"))
		end)

    vim.keymap.set("n", "<A-1>", function() harpoon:list("1"):select(1) end)
    vim.keymap.set("n", "<A-2>", function() harpoon:list("1"):select(2) end)
    vim.keymap.set("n", "<A-3>", function() harpoon:list("1"):select(3) end)
    vim.keymap.set("n", "<A-4>", function() harpoon:list("1"):select(4) end)

    vim.keymap.set("n", "<leader>1", function() harpoon:list("1"):replace_at(1) end)
    vim.keymap.set("n", "<leader>2", function() harpoon:list("1"):replace_at(2) end)
    vim.keymap.set("n", "<leader>3", function() harpoon:list("1"):replace_at(3) end)
    vim.keymap.set("n", "<leader>4", function() harpoon:list("1"):replace_at(4) end)

    vim.keymap.set("n", "<A-q>", function() harpoon:list("2"):select(1) end)
    vim.keymap.set("n", "<A-w>", function() harpoon:list("2"):select(2) end)
    vim.keymap.set("n", "<A-e>", function() harpoon:list("2"):select(3) end)
    vim.keymap.set("n", "<A-r>", function() harpoon:list("2"):select(4) end)

    vim.keymap.set("n", "<leader>q", function() harpoon:list("2"):replace_at(1) end)
    vim.keymap.set("n", "<leader>w", function() harpoon:list("2"):replace_at(2) end)
    vim.keymap.set("n", "<leader>e", function() harpoon:list("2"):replace_at(3) end)
    vim.keymap.set("n", "<leader>r", function() harpoon:list("2"):replace_at(4) end)

    vim.keymap.set("n", "<A-8>", function() harpoon:list("3"):select(1) end)
    vim.keymap.set("n", "<A-9>", function() harpoon:list("3"):select(2) end)
    vim.keymap.set("n", "<A-0>", function() harpoon:list("3"):select(3) end)

    vim.keymap.set("n", "<leader>8", function() harpoon:list("3"):replace_at(1) end)
    vim.keymap.set("n", "<leader>9", function() harpoon:list("3"):replace_at(2) end)
    vim.keymap.set("n", "<leader>0", function() harpoon:list("3"):replace_at(3) end)
	end,
}
