const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const logger = require("./logger");

const db = mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1/kis");
db.catch((e) => logger.log("error", e.message));

const dataSchema = new Schema({
    value: [
        {
            ticker: {
                type: String,
                required: true
            },
            price: {
                type: Number,
                required: true
            },
            change: {
                type: Number,
                required: true
            },
            percentChange: {
                type: Number,
                required: true
            },
            volume: {
                type: Number,
                required: true
            },
            marketCap: {
                type: Number,
                required: true
            }
        }
    ]
});

module.exports = {
    connection: db,
    Data: mongoose.model("Data", dataSchema)
};
