import { CallClient, CallAgent } from "@azure/communication-calling";
import { AzureCommunicationTokenCredential } from '@azure/communication-common';
const { CommunicationIdentityClient } = require('@azure/communication-identity');
var Connection = require('tedious').Connection;
var Request = require('tedious').Request;
var TYPES = require('tedious').TYPES;
const moment = require('moment');
const line = require('@line/bot-sdk');

const client = new line.Client({
    channelAccessToken: process.env.ACCESS_TOKEN
});

let callAgent;

const execute_scan = (context) => new Promise((resolve, reject) => {
    var content = [];
    var config = {
        server: process.env.DB_SERVER,
        authentication: {
            type: 'default',
            options: {
                userName: process.env.DB_USER,
                password: process.env.DB_PASSWORD
            }
        },
        options: {
            encrypt: true,
            database: process.env.DB_NAME
        }
    };
    
    var connection = new Connection(config);
    var sql_query = "SELECT * FROM UserInfo WHERE Specify=1;"
    connection.on('connect', function(err) { 
        if (err) {
            console.log(err);
            reject(err);
            context.done();
        } else {
            request = new Request(
                sql_query,
                function(err) {
                    if (err) {
                        console.log(err);
                        reject(err);
                    } else {
                        console.log('resolve');
                        resolve(content);
                    };
                    context.done();
            });
            request.on('row', function(columns) {
                content.push(columns);
            });
            request.on('requestCompleted', function () {
                connection.close();
            });
            connection.execSql(request);
        }
    });
    connection.on('end', function(err) {
        console.log("connection End");
    });
    connection.connect();
});

const reset_specify = (context, id) => new Promise((resolve, reject) => {
    var config = {
        server: process.env.DB_SERVER,
        authentication: {
            type: 'default',
            options: {
                userName: process.env.DB_USER,
                password: process.env.DB_PASSWORD
            }
        },
        options: {
            encrypt: true,
            database: process.env.DB_NAME
        }
    };

    var connection = new Connection(config);
    var sql_query = "UPDATE UserInfo SET SpecifiedTime=@Zero, Specify=0 WHERE UserID=@ID;";
    connection.on('connect', function(err) { 
        if (err) {
            console.log(err);
            reject(err);
            context.done();
        } else {
            request = new Request(
                sql_query,
                function(err) {
                    if (err) {
                        console.log(err);
                        reject(err);
                    } else {
                        console.log('resolve');
                        resolve();
                    };
                    context.done();
            });
            request.addParameter('ID', TYPES.NVarChar, id);
            request.addParameter('Zero', TYPES.NVarChar, '0');
            request.on('requestCompleted', function () {
                connection.close();
            });
            connection.execSql(request);
        }
    });
    connection.on('end', function(err) {
        console.log("connection End");
    });
    connection.connect();
});

async function get_voip_token() {
    const connectionString = process.env['COMMUNICATION_SERVICES_CONNECTION_STRING'];
    const identityClient = new CommunicationIdentityClient(connectionString);
    let identityResponse = await identityClient.createUser();
    let tokenResponse = await identityClient.getToken(identityResponse, ["voip"]);
    const { token, expiresOn } = tokenResponse;
    return token;
};

async function init() {
    const callClient = new CallClient();
    var voip_token = await get_voip_token()
    const tokenCredential = new AzureCommunicationTokenCredential(voip_token);
    callAgent = await callClient.createCallAgent(tokenCredential);
}



function hang_up(call) {
    call.hangUp({
        forEveryone: true
    });
}




module.exports = async function (context, myTimer) {

    init();
    
    var timeStamp = new Date().toISOString();
    context.log('Node timer trigger function ran!', timeStamp);

    execute_scan(context).then(content => {
        console.log(content);
        content.forEach(columns => {
            var record = []
            columns.forEach(column => {
                if (column.value === null) {
                    console.log('NULL');
                } else {
                    record.push(column.value);
                }
            });
            console.log(record);
            if (moment(record[3]).utc().isSameOrBefore(moment().utc())) {
                var call = callAgent.startCall(
                    [{phoneNumber: record[1]}], { alternateCallerId: {phoneNumber: process.env.AZURE_PHONE_NUMBER}
                });
                setTimeout(hang_up(call), 10000);
                reset_specify(context, record[0]);
                message = {
                    type: "text",
                    text: "おきてー"
                }
                client.pushMessage(record[0], message);
            }
        });
    });

};