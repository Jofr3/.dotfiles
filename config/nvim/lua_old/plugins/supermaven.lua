return {
	"supermaven-inc/supermaven-nvim",
	enabled = false,
	config = function()
		require("supermaven-nvim").setup({
			keymaps = {
				accept_suggestion = "<A-Tab>",
				clear_suggestion = "<A-Backspace>",
				accept_word = "<A-Space>",
			},
		})
	end,
}
