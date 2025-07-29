return {
	"nguyenvukhang/nvim-toggler",
	enabled = true,
	-- lazy = false,
  event = "VeryLazy",
	opts = {
		inverses = {
			["true"] = "false",
			["- [ ]"] = "- [X]",
			["yes"] = "no",
			["left"] = "right",
			["top"] = "bottom",
			["&&"] = "||",
			["dd"] = "dump",
			["asc"] = "desc",
			[">"] = "<",
			[">="] = "<=",
			["=="] = "!=",
			["==="] = "!==",
		},
		remove_default_keybinds = true,
		remove_default_inverses = true,
	},
	keys = {
		{ mode = { "n", "v" }, "<A-a>", "<cmd>lua require('nvim-toggler').toggle()<cr>" },
	},
}
