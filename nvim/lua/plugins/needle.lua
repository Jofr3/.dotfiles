return {
	"Jofr3/needle",
	enabled = true,
	opts = {},
	keys = {
		{ "<C-l>", "<cmd>lua require('needle.marks').add_mark()<cr>", remap = true, desc = "Add mark" },
		{ "<C-x>", "<cmd>lua require('needle.marks').delete_mark()<cr>", remap = true, desc = "Delete mark" },
		{ "<Leader>x", "<cmd>lua require('needle.marks').clear_marks()<cr>", remap = true, desc = "Clear marks" },

		{
			"<Leader>q",
			"<cmd>lua require('needle.marks').jump_to_mark('q')<cr>",
			remap = true,
			desc = "Jump to mark q",
		},
		{
			"<Leader>w",
			"<cmd>lua require('needle.marks').jump_to_mark('w')<cr>",
			remap = true,
			desc = "Jump to mark w",
		},
		{
			"<Leader>e",
			"<cmd>lua require('needle.marks').jump_to_mark('e')<cr>",
			remap = true,
			desc = "Jump to mark e",
		},
		{
			"<Leader>r",
			"<cmd>lua require('needle.marks').jump_to_mark('r')<cr>",
			remap = true,
			desc = "Jump to mark r",
		},
		{
			"<Leader>t",
			"<cmd>lua require('needle.marks').jump_to_mark('t')<cr>",
			remap = true,
			desc = "Jump to mark t",
		},
		{
			"<Leader>y",
			"<cmd>lua require('needle.marks').jump_to_mark('y')<cr>",
			remap = true,
			desc = "Jump to mark y",
		},
		{
			"<Leader>u",
			"<cmd>lua require('needle.marks').jump_to_mark('u')<cr>",
			remap = true,
			desc = "Jump to mark u",
		},
	},
}
