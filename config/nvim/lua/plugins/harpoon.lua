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

    vim.keymap.set("n", "<A-1>", function() harpoon:list("1"):select(1) end)
    vim.keymap.set("n", "<A-2>", function() harpoon:list("1"):select(2) end)
    vim.keymap.set("n", "<A-3>", function() harpoon:list("1"):select(3) end)
    vim.keymap.set("n", "<A-4>", function() harpoon:list("1"):select(4) end)

		vim.keymap.set("n", "<A-!>", function()
			harpoon:list("1"):add()
		end)
		vim.keymap.set("n", "<A-@>", function()
			harpoon:list("1"):add()
		end)
		vim.keymap.set("n", "<A-#>", function()
			harpoon:list("1"):add()
		end)
		vim.keymap.set("n", "<A-$>", function()
			harpoon:list("1"):add()
		end)

    vim.keymap.set("n", "<A-q>", function() harpoon:list("2"):select(1) end)
    vim.keymap.set("n", "<A-w>", function() harpoon:list("2"):select(2) end)
    vim.keymap.set("n", "<A-e>", function() harpoon:list("2"):select(3) end)
    vim.keymap.set("n", "<A-r>", function() harpoon:list("2"):select(4) end)

		vim.keymap.set("n", "<A-S-q>", function()
			harpoon:list("2"):add()
		end)
		vim.keymap.set("n", "<A-S-w>", function()
			harpoon:list("2"):add()
		end)
		vim.keymap.set("n", "<A-S-e>", function()
			harpoon:list("2"):add()
		end)
		vim.keymap.set("n", "<A-S-r>", function()
			harpoon:list("2"):add()
		end)

    vim.keymap.set("n", "<A-8>", function() harpoon:list("3"):select(1) end)
    vim.keymap.set("n", "<A-9>", function() harpoon:list("3"):select(2) end)
    vim.keymap.set("n", "<A-0>", function() harpoon:list("3"):select(3) end)

		vim.keymap.set("n", "<A-*>", function()
			harpoon:list("3"):add()
		end)
		vim.keymap.set("n", "<A-(>", function()
			harpoon:list("3"):add()
		end)
		vim.keymap.set("n", "<A-)>", function()
			harpoon:list("3"):add()
		end)
	end,
}
