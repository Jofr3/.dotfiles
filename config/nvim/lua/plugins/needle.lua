return {
	"Jofr3/needle",
  enabled = true,
	lazy = false,
  opts = {},
	keys = {
		{ mode = "n", "<A-t>", "<cmd>lua require('needle.mark').jump_to_mark(1)<cr>" },
		{ mode = "n", "<A-y>", "<cmd>lua require('needle.mark').jump_to_mark(2)<cr>" },
		{ mode = "n", "<A-u>", "<cmd>lua require('needle.mark').jump_to_mark(3)<cr>" },
		{ mode = "n", "<A-i>", "<cmd>lua require('needle.mark').jump_to_mark(4)<cr>" },
		{ mode = "n", "<A-o>", "<cmd>lua require('needle.mark').jump_to_mark(5)<cr>" },
		{ mode = "n", "<A-p>", "<cmd>lua require('needle.mark').jump_to_mark(6)<cr>" },

		{ mode = "n", "<A-]>", "<cmd>lua require('needle.mark').jump_to_next()<cr>" },
		{ mode = "n", "<A-[>", "<cmd>lua require('needle.mark').jump_to_prev()<cr>" },
	}
}
