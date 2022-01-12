const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const logger = require("./config/logger");
const cors = require("cors");
const puppeteer = require("puppeteer");
const {Data} = require("./config/mongo");
const {TwitterApi} = require("twitter-api-v2");

const app = express();
app.use(express.json());
app.use(express.static("./static"));
app.use(cors());

const secrets = {
    api: process.env.API,
    apiSecret: process.env.API_SECRET,
    bearerToken: process.env.BEARER_TOKEN,
    aToken: process.env.A_TOKEN,
    aSecret: process.env.A_SECRET
}

const twitterClient = new TwitterApi({
    appKey: secrets.api,
    appSecret: secrets.apiSecret,
    accessToken: secrets.aToken,
    accessSecret: secrets.aSecret
});

const port = process.env.PORT || 8080;
const sleepInterval = process.env.SLEEP_INTERVAL || 15000; //4 * 3600 * 1000; //x h * 3600 s * 1000 ms
const minPercentChange = process.env.MIN_PERCENT_CHANGE || 20;
let intervalId;

const main =
    () => {
        const target = "https://finance.yahoo.com/gainers";

        (async (selector, options) => {
            const browser = await puppeteer.launch();
            const page = await browser.newPage();
            await page.goto(target);
            await page.waitForSelector("#consent-page"); //Pocaka na cookie modal window
            console.log("#consent-page found.");

            await page.click("button[value=agree]", {}); //Agree with cookies
            console.log("agreed to using cookies.");

            await page.waitForSelector("#scr-res-table > div.Ovx\\(a\\).Ovx\\(h\\)--print.Ovy\\(h\\).W\\(100\\%\\) > table", { //Pocaka da se nalozi tabela z podatki
                visible: true
            });
            console.log("table is visible.");

            const lineCount = await page.$eval(
                "#scr-res-table > div.Ovx\\(a\\).Ovx\\(h\\)--print.Ovy\\(h\\).W\\(100\\%\\) > table > tbody",
                (tbody) => {
                    return tbody.hasChildNodes() ? tbody.children.length : 0;
                });
            console.log(`Found ${lineCount} table rows.`);

            const objArray = [];

            const rowSelector = "#scr-res-table > div.Ovx\\(a\\).Ovx\\(h\\)--print.Ovy\\(h\\).W\\(100\\%\\) > table > tbody > tr:nth-child(ROW)";
            const column = " > td:nth-child(COLUMN)";
            for (let i = 1; i <= lineCount; i++) { //Determine valid rows
                let foo = rowSelector.replace("ROW", i);
                let columnCount = await page.$eval(
                    foo,
                    (trElement) => {
                        return trElement.children.length;
                    });

                //console.log(`${foo} ------- ${columnCount}`);

                if (columnCount > 8) { //Rabimo samo prvih 8 columnov iz tabele.
                    let obj = {};
                    let name = false;

                    for (let j = 1; j <= 8; j++) {
                        let columnSelector = foo + column.replace("COLUMN", j);
                        let tdChildrenCount = await page.$eval(
                            columnSelector,
                            (td) => {
                                return td.children.length;
                            });

                        switch (tdChildrenCount) {
                            case 0: //Name ali Avg. vol
                                break;

                            case 1: //Price, change, % change, volume, market cap
                                let valueSelector = columnSelector + " > fin-streamer";
                                let value = await page.$eval(
                                    valueSelector,
                                    (o) => {
                                        return o.attributes.getNamedItem("value").value;
                                    }
                                );

                                if (!obj.price) {
                                    obj.price = value;
                                    break;
                                }

                                if (!obj.change) {
                                    obj.change = value;
                                    break;
                                }

                                if (!obj.percentChange) {
                                    obj.percentChange = value;
                                    break;
                                }

                                if (!obj.volume) {
                                    obj.volume = value;
                                    break;
                                }

                                if (!obj.marketCap) {
                                    obj.marketCap = value;
                                    break;
                                }
                                break;

                            case 3: //stock ticker
                                let tickerSelector = columnSelector + " > a";
                                let ticker = await page.$eval(
                                    tickerSelector,
                                    (tickerObj) => {
                                        return tickerObj.innerHTML;
                                    }
                                );

                                obj.ticker = ticker;
                                break;

                            default:
                                console.error("To nebi smelo bit mozno...");
                                break;
                        }
                    }
                    objArray.push(obj);
                }
            }

            try {
                const inserted = await Data.create({value: objArray});
                logger.log("debug", `Pushed ticker data to database.(${JSON.stringify(inserted)})`);
            } catch (e) {
                logger.log("error", `Error occured while inserting to database: ${e.message}`);
            }

            const tweetable = objArray.filter((o) => {
                return o.percentChange >= minPercentChange
            });

            for (const x of tweetable) {
                const text = `GAINER ALERT:\n ${x.name} +${x.percentChange}%`;
                try {
                    const {data: createdTweet} = await twitterClient.v2.tweet(text);
                    logger.log("info", `Successfully tweeted: ${createdTweet.text}`);
                } catch (e) {
                    logger.log("error", `Error occured while tweeting: ${e}`);
                }

            }

            await browser.close();
        })();

    }

/*
 * API endpoint definitions
 */
app.get(
    "/start",
    async (req, res) => {
        logger.log(`debug`, `Starting main application loop.`);

        if (!intervalId) {
            intervalId = setInterval(() => main(), sleepInterval);
            logger.log("info", "Successfully started.");
            res.status(200).send("");

            return;
        }

        logger.log("medium", "Someone tried to start an already running loop.");
        res.status(500).send("Can't start a thread that is already running.");
    });

app.get(
    "/stop",
    async (req, res) => {
        logger.log(`debug`, `Stopping main application loop.`);

        if (!intervalId) {
            logger.log(`medium`, `Someone tried to stop a non-existent loop.`)

            res.status(500).send("Can't stop a thread that is not running.");
            return;
        }

        clearInterval(intervalId);
        intervalId = undefined;
        logger.log("info", "Successfully stopped.");
        res.status(200).send("");
    });

app.listen(port, () => {
    logger.log(
        `debug`,
        `Server started. Listening on port ${port}`
    );
});