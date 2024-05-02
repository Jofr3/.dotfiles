return {
	"L3MON4D3/LuaSnip",
	version = "v2.*",
	config = function()
		local ls = require("luasnip")
		require("other.snippets")

		vim.keymap.set({ "i" }, "<A-Tab>", function()
			ls.expand()
		end, { silent = true })
		vim.keymap.set({ "i", "s" }, "<C-L>", function()
			ls.jump(1)
		end, { remap = true, silent = true })
		vim.keymap.set({ "i", "s" }, "<C-J>", function()
			ls.jump(-1)
		end, { remap = true, silent = true })
	end,
}
