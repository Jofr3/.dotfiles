return {
	"mbbill/undotree",
	enabled = true,
	config = function()
		vim.g.undotree_WindowLayout = 3
	end,
	keys = {
		{ "<Leader>u", "<cmd>UndotreeToggle<cr>", desc = "undotree" },
	},
}
