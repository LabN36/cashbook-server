const express = require('express');
const RedisClient = require("redis");
const AWS = require("aws-sdk");
const uuid = require('uuid');
var bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const app = express();
const redis = RedisClient.createClient();
const cred = require('./cred');//edit your cred.json file

const port = cred.PORT;
const ID = cred.AWSID;
const KEY = cred.AWSKEY;
const AppHash = cred.APPHASH;
const Region = cred.AWSSMSREGION;
const SECRET = cred.JWTSIGNSECRET;
const JWTEXPIRY = cred.JWTEXPIRY;
const CUNTRYCODE = cred.CUNTRYCODE;
const APPNAME = cred.APPNAME;

const awsSNS = new AWS.SNS({
    apiVersion: "2010-03-31",
    region: Region,
    credentials: new AWS.Credentials(ID, KEY)
});

const DataNotFoundMessage = 'Sufficient Data not provided';
const InternalErrorMessage = 'something went wrong';

redis.on("error", function (error) {
    console.error(error);
});

redis.on("connect", function (error) {
    console.log('[Redis Connected]');
});

function connectRedis() {
    console.log('[connectRedis function call]');
    return new Promise(function (resolve, reject) {
        redis.on("connect", function (err) {
            console.log(err);
            console.log("[Redis Connected]");
            resolve();
        });
    });
}

function getData(key) {
    console.log('[getData] function call ', key);
    return new Promise(function (resolve, reject) {
        redis.get(key, function (err, reply) {
            if (err) {
                console.log(err);
            }
            console.log("redis.get ", reply);
            resolve(reply);
        });
    });
}

function setData(key, value) {
    console.log('[setData] function call ', key, value);
    return new Promise(function (resolve, reject) {
        redis.set(key, JSON.stringify(value), function (err, reply) {
            if (err) {
                console.log(err);
            }
            console.log("redis.set ", reply);
            resolve(reply);
        });
    });
}

function sendSMS(params) {
    console.log('[publish]: function');
    console.log(params);
    return new Promise(function (resolve, reject) {
        console.log('sendSMS [Promise Call]');
        awsSNS.publish(params, function (err, data) {
            if (err) {
                console.log('[publish err]');
                console.log('[After Error]', Date());
                console.log(err);
                resolve(err);
            }
            else {
                console.log('[publish success]', Date());
                console.log('[Success] ', data);
                resolve(data);
            }
        });
    });
}


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.post('/verify', async (req, resp) => {
    console.log('[verify] Start', new Date());
    console.log(JSON.stringify(req.body));

    var body = {};
    if (req.body != undefined && req.body.userid != undefined && req.body.otp != undefined) {
        body = req.body;
        try {
            const userid = body.userid;
            console.log('[verify][userid]', userid);
            console.log('[verify][Before]: getData ', Date());
            const redisResponse = await getData(userid).then();
            console.log('[verify][After]: getData ', Date());
            console.log('[verify][redisResponse] ', redisResponse);
            var response = {
                statusCode: 200
            };
            if (redisResponse != undefined) {
                var otp = JSON.parse(redisResponse);
                if (parseInt(otp) == body.otp) {
                    response.body = { error: false, success: true, isError: false, message: 'OTP verified successfully', userid };
                    response.body.jwt = jwt.sign({ userid }, SECRET, { expiresIn: JWTEXPIRY });
                    //TODO:create profile in databse
                    //TODO:you can save jwt if you want
                }
                else {
                    response.body = { error: true, isError: true, success: false, message: 'Wrong OTP, please try again.', userid };
                }
            }
            else {
                response.body = { error: true, isError: true, success: false, message: 'userid not valid', userid };
            }
            response.body = response.body;
            console.log('[verify] End', new Date());
            resp.json(response);
        }
        catch (error) {
            console.log('[verify][Error]');
            console.log(error);
            const response = {
                statusCode: 200,
                body: { error: true, isError: true, success: false, message: InternalErrorMessage },
            };
            resp.json(response);
        }
    } else {
        resp.json({ success: false, error: true, isError: true, message: DataNotFoundMessage });
    }


});

app.post('/sendtext', async (req, resp) => {
    console.log('[sendtext] Start', new Date());
    var body = {};
    var OTP;
    if (req.body != undefined && req.body.phone != undefined) {
        body = req.body;
        try {
            const phone = body.phone;
            const recipient = CUNTRYCODE + phone;
            const redisResponse = await getData(recipient).then();
            var userid;
            if (redisResponse != undefined && redisResponse != null) {
                //Returning User
                userid = JSON.parse(redisResponse);
            } else {
                //New User
                userid = uuid.v4();
            }
            console.log('[sendtext][userid] ', userid);
            console.log('[sendtext][phone]', phone);
            OTP = Date.now().toString().slice(-6);
            const text = `<#> Your OTP for \n${APPNAME} is:  ${OTP}           \n\n${AppHash}          `;//Change your OTP Message here
            var params = { Message: text, PhoneNumber: recipient };

            console.log('[sendtext][Before]: sendSMS ', Date());
            const res = await sendSMS(params).then();
            console.log('[sendtext][After]: sendSMS ', Date());

            console.log('[sendtext][Before]: setData ', Date());
            const redisSetReply = await setData(userid, OTP).then();
            console.log('[sendtext][After]: setData ', Date());
            console.log(redisSetReply);
            const response = {
                statusCode: 200,
                body: { error: false, success: true, message: 'OTP sent successfully', userid }
            }
            setData(recipient, userid);
            console.log('[sendtext][sendtext] End', new Date());
            resp.json(response);
        }
        catch (error) {
            console.log('[sendtext][Error]');
            console.log(error);
            const response = {
                statusCode: 200,
                body: { error: true, message: InternalErrorMessage },
            };
            resp.json(response);
        }
    } else {
        resp.json({ success: false, error: true, isError: true, message: DataNotFoundMessage });
    }

});

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
})