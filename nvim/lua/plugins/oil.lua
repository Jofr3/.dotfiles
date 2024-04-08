return {
	"stevearc/oil.nvim",
	enabled = true,
	config = function()
		require("oil").setup({
			default_file_explorer = true,
			delete_to_trash = true,
			view_options = {
				show_hidden = true,
			},
            skip_confirm_for_simple_edits = true,
            keymaps = {
                ["<CR>"] = "actions.select",
                ["<Esc>"] = "actions.close",
                ["<Tab>"] = "actions.parent"
            },
            use_default_keymaps = false,
		})
	end,
	keys = {
		{ "<Leader>n", "<CMD>Oil<CR>", desc = "File exporer" },
	},
}
