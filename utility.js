
const errorMap = require('./error-map.json');

class ClientError extends Error {
    constructor(id, { message, code, data } = {}) {
        let defError = errorMap[id];
        if (!message) {
            message = defError.message || id;
        }
        if (!code) {
            code = defError.code || 400;
        }
        if (!data) {
            data = defError.data || null;
        }
        super(message);
        this.name = 'ClientError';
        this.id = id;
        this.expose = false;
        this.statusCode = code;
        this.data = data;
        this.isClientError = true;
    }
}

class NotFoundError extends ClientError {
    constructor(opt) {
        super('base:not_found', opt);
        this.name = 'NotFoundError';
    }
}

class UnknownError extends ClientError {
    constructor(opt) {
        super('base:unknown_error', opt);
        this.name = 'UnknownError';
    }
}

class InternalServerError extends ClientError {
    constructor(err) {
        super('base:internal_server_error', {
            message: err.message,
            data: {
                stack: err.stack
            }
        });
        this.name = 'InternalServerError';
    }
}

module.exports = {
    ClientError,
    NotFoundError, UnknownError, InternalServerError
};
