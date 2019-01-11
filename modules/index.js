
'use strict';

let router = server.router;

router.get('/', async (ctx) => {
    await ctx.render('index', { ctx });
});
