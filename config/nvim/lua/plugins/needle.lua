return {
	"Jofr3/needle",
  enabled = true,
	lazy = false,
	config = function()
		require("needle").setup()
	end,
	keys = {
		{ mode = "n", "<D-q>", "<cmd>lua require('needle.mark').jump_to_mark(1)<cr>" },
		{ mode = "n", "<D-w>", "<cmd>lua require('needle.mark').jump_to_mark(2)<cr>" },
		{ mode = "n", "<D-e>", "<cmd>lua require('needle.mark').jump_to_mark(3)<cr>" },
		{ mode = "n", "<D-r>", "<cmd>lua require('needle.mark').jump_to_mark(4)<cr>" },
		{ mode = "n", "<D-t>", "<cmd>lua require('needle.mark').jump_to_mark(5)<cr>" },
		{ mode = "n", "<D-y>", "<cmd>lua require('needle.mark').jump_to_mark(6)<cr>" },

		{ mode = "n", "<D-]>", "<cmd>lua require('needle.mark').jump_to_next()<cr>" },
		{ mode = "n", "<D-[>", "<cmd>lua require('needle.mark').jump_to_prev()<cr>" },
	}
}
