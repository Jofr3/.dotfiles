return {
	"ibhagwan/fzf-lua",
	enabled = false,
	lazy = false,
	opts = {
		fzf_bin = "sk",
		winopts = {
			backdrop = 100,
			preview = {
				title = false,
			},
		},
		files = {
			fd_opts = [[--type f --hidden --follow --exclude .git --exclude node_modules --exclude public_html/]],
		},
	},
  keys = {
		{ mode = "n", "<A-f>", "<cmd>lua require('fzf-lua').files()<cr>" },
		{ mode = "n", "<A-g>", "<cmd>lua require('fzf-lua').live_grep()<cr>" },
		{ mode = "n", "<A-b>", "<cmd>lua require('fzf-lua').complete_file()<cr>" },
		{ mode = "n", "<A-/>", "<cmd>lua require('fzf-lua').blines()<cr>" },
		{ mode = "n", "<A-z>", "<cmd>lua require('fzf-lua').builtin()<cr>" },
		{ mode = "n", "<space><space>", "<cmd>lua require('fzf-lua').resume()<cr>" },
  }
}
