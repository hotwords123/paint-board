
'use strict';

const logger = require('./logger');

logger.log('Server starting...');

global.server = require('./app.js');

(async () => {

    try {
        await server.startup();
        await server.work();
        logger.log('Server started successfully.');
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }

})();
