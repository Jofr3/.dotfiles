return {
    'kristijanhusak/vim-dadbod-ui',
    enabled = true,
    dependencies = {
        { 'tpope/vim-dadbod',                     lazy = true },
        { 'kristijanhusak/vim-dadbod-completion', ft = { 'sql', 'mysql', 'plsql' }, lazy = true }, -- Optional
    },
    cmd = {
        'DBUI',
        'DBUIToggle',
        'DBUIAddConnection',
        'DBUIFindBuffer',
    },
    init = function()
        vim.api.nvim_create_autocmd("FileType", {
            pattern = "dbout",
            callback = function()
                vim.opt_local.number = false
                vim.opt_local.relativenumber = false
                vim.opt_local.signcolumn = "no"
            end,
        })

        vim.g.dbs = {
            { name = 'myclientum dev',  url = 'mysql://dev_myclientum:BeHkm8yAvLimTfE9GidvyZcYeL5mw5Vj@lasevawebdatabases.caczfioe6no3.eu-west-3.rds.amazonaws.com:3306/dev_myclientum' },
            { name = 'myclientum prod', url = 'mysql://admin_crm_lsw:$Nok7n30@lasevawebdatabases.caczfioe6no3.eu-west-3.rds.amazonaws.com:3306/crm_lsw' },
            { name = 'vicfires',        url = 'mysql://vic_fires_u:Uz6sCpr4BJBonEDfzwfNb9rqkXF2BF26@lasevawebdatabases.caczfioe6no3.eu-west-3.rds.amazonaws.com:3306/vic_fires' },
            { name = 'tacprod dev',     url = 'mysql://dev88323_tacprod:f%2AMhWBKp%2333xGzhG@tacprod-new.caczfioe6no3.eu-west-3.rds.amazonaws.com:3306/dev88323_tacprod' },
            { name = 'arete',           url = 'mysql://analytics.aretesegonama.cat:jx654Z2~i@analytics.aretesegonama.cat:3306/analytics.aretesegonama.cat' },
        }
    end,
}
