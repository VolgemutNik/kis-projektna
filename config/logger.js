/*
    A Simple winston logger implementation.
 */
const winston = require("winston");
const dirname = "./_logs";

const format = winston.format.combine(
    winston.format.timestamp({format: "YYYY-MM-DD HH:mm:ss:ms"}),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

const logger = winston.createLogger({
    level: "debug",
    format: format,
    transports: [
        new winston.transports.File({dirname: dirname, filename: "main.log"}),
        new winston.transports.File({dirname: dirname, filename: "error.log", level: "error"}),
        new winston.transports.Console({
            format: winston.format.combine(
                format,
                winston.format.colorize({all: true})
            )
        })
    ]
});

module.exports = logger;