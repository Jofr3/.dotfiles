local ls = require("luasnip")
local extras = require("luasnip.extras")
local fmt = require("luasnip.extras.fmt").fmt
local rep = extras.rep
local s = ls.snippet
local t = ls.text_node
local i = ls.insert_node

ls.add_snippets("lua", {
	s("ins", {
		t("print(vim.inspect("),
		i(1),
		t("))"),
	}),
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
