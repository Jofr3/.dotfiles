return {
  'saghen/blink.cmp',
  enabled = true,
  lazy = false,
  version = '0.10.0',
  opts = {
    sources = {
      default = { 'snippets', 'lsp', 'path', 'buffer', "dadbod" },
      providers = {
        dadbod = { name = "Dadbod", module = "vim_dadbod_completion.blink" },
      },
    },
    keymap = {
      preset = 'none',
      ['<A-j>'] = {
        function(cmp)
          return cmp.select_next({ auto_insert = true })
        end,
        'select_and_accept'
      },
      ['<A-k>'] = {
        function(cmp)
          return cmp.select_prev({ auto_insert = true })
        end,
        'select_and_accept'
      },
      ['<Tab>'] = { 'select_and_accept', 'fallback' },
      ['<A-l>'] = { 'snippet_forward', 'fallback' },
      ['<A-h>'] = { 'snippet_backward', 'fallback' },
    },
  },
}
