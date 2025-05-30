return {
	"Jofr3/needle",
  enabled = true,
	lazy = false,
	config = function()
		require("needle").setup()
	end,
	keys = {
		{ mode = "n", "<A-q>", "<cmd>lua require('needle.mark').jump_to_mark(1)<cr>" },
		{ mode = "n", "<A-w>", "<cmd>lua require('needle.mark').jump_to_mark(2)<cr>" },
		{ mode = "n", "<A-e>", "<cmd>lua require('needle.mark').jump_to_mark(3)<cr>" },
		{ mode = "n", "<A-r>", "<cmd>lua require('needle.mark').jump_to_mark(4)<cr>" },
		{ mode = "n", "<A-t>", "<cmd>lua require('needle.mark').jump_to_mark(5)<cr>" },
		{ mode = "n", "<A-y>", "<cmd>lua require('needle.mark').jump_to_mark(6)<cr>" },

		{ mode = "n", "<A-]>", "<cmd>lua require('needle.mark').jump_to_next()<cr>" },
		{ mode = "n", "<A-[>", "<cmd>lua require('needle.mark').jump_to_prev()<cr>" },
	}
}
