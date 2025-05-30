return {
	"L3MON4D3/LuaSnip",
	version = "v2.*",
	build = "make install_jsregexp",
	enabled = true,
	lazy = false,
	init = function()
		require("luasnip.loaders.from_vscode").load_standalone({ path = "~/.config/nvim/snippets/javascript.json" })
		require("luasnip.loaders.from_vscode").load_standalone({ path = "~/.config/nvim/snippets/lua.json" })
		require("luasnip.loaders.from_vscode").load_standalone({ path = "~/.config/nvim/snippets/markdown.json" })
		require("luasnip.loaders.from_vscode").load_standalone({ path = "~/.config/nvim/snippets/php.json" })
	end,
	keys = {
		{ mode = "i", "<A-Tab>", "<cmd>lua require('luasnip').expand()<cr>" },
		{ mode = { "i", "n" }, "<A-l>", "<cmd>lua require('luasnip').jump(1)<cr>" },
		{ mode = { "i", "n" }, "<A-h>", "<cmd>lua require('luasnip').jump(-1)<cr>" },
	},
}
