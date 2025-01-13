return {
  'nguyenvukhang/nvim-toggler',
  enabled = true,
  lazy = false,
  opts = {
    inverses = {
      ['true'] = 'false',
    },
    remove_default_keybinds = true,
    remove_default_inverses = true,
  },
  keys = {
    { mode = { 'n', 'v' }, '<A-q>', "<cmd>lua require('nvim-toggler').toggle()<cr>" },
  }
}
