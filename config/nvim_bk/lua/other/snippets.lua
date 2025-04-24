local ls = require("luasnip")
local extras = require("luasnip.extras")
local fmt = require("luasnip.extras.fmt").fmt
local rep = extras.rep
local s = ls.snippet
local t = ls.text_node
local i = ls.insert_node

ls.add_snippets("lua", {
    s(
        "p",
        fmt(
            [[
        print({})
            ]],
            { i(1) }
        )
    ),

    s(
        "ins",
        fmt(
            [[
        print(vim.inspect({}))
            ]],
            { i(1) }
        )
    ),

    s(
        "fun",
        fmt(
            [[
        function {}()
            {}
        end
            ]],
            { i(1), i(2) }
        )
    ),
})

ls.add_snippets("php", {
    s("d", {
        t("dd("),
        i(1),
        t(");"),
    }),

    s("du", {
        t("dump("),
        i(1),
        t(");"),
    }),

    s("log",
        fmt(
            [[
        console.log({});
            ]],
            { i(1) }
        )
    ),

    s("get", {
        t("Session::get('"),
        i(1),
        t("');"),
    }),

    s("has", {
        t("Sentry::getUser()->hasAccess(['"),
        i(1),
        t("']);"),
    }),

    s(
        "el",
        fmt(
            [[
        <{}/>
            ]],
            { i(1) }
        )
    ),

    s(
        "ele",
        fmt(
            [[
        <{}>{}</{}>
            ]],
            { i(1), i(2), rep(1) }
        )
    ),
})

ls.add_snippets("vue", {
    s(
        "el",
        fmt(
            [[
        <{}/>
            ]],
            { i(1) }
        )
    ),

    s(
        "ele",
        fmt(
            [[
        <{}>{}</{}>
            ]],
            { i(1), i(2), rep(1) }
        )
    ),

    s(
        "log",
        fmt(
            [[
        console.log({})
            ]],
            { i(1) }
        )
    ),
})

ls.add_snippets("js", {
    s(
        "log",
        fmt(
            [[
        console.log({})
            ]],
            { i(1) }
        )
    ),
})

ls.add_snippets("ts", {
    s(
        "log",
        fmt(
            [[
        console.log({})
            ]],
            { i(1) }
        )
    ),
})

ls.add_snippets("html", {
    s(
        "el",
        fmt(
            [[
        <{}/>
            ]],
            { i(1) }
        )
    ),

    s(
        "ele",
        fmt(
            [[
        <{}>{}</{}>
            ]],
            { i(1), i(2), rep(1) }
        )
    ),
})

ls.add_snippets("sql", {
    s(
        "all",
        fmt(
            [[
        select * from {};
            ]],
            { i(1) }
        )
    ),
})
