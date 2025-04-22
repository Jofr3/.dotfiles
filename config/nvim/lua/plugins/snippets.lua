return {
	"echasnovski/mini.snippets",
	enabled = true,
	lazy = false,
	config = function()
		local gen_loader = require("mini.snippets").gen_loader
		require("mini.snippets").setup({
			snippets = {
				gen_loader.from_lang(),
			},
			mappings = {
				expand = "<A-Tab>",
				jump_next = "<A-l>",
				jump_prev = "<A-h>",
			},
		})
	end,
}
