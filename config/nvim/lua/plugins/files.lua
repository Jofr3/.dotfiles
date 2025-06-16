return {
	"echasnovski/mini.files",
	version = "*",
	enabled = true,
	lazy = false,
	opts = {
		mappings = {
			go_in_plus = "<Enter>",
			synchronize = "<A-Enter>",
		},
	},
	keys = {
		{ mode = "n", "<A-n>", "<cmd>lua MiniFiles.open(vim.api.nvim_buf_get_name(0))<cr>" },
	},
}
