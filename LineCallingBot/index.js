const moment = require('moment');
const line = require('@line/bot-sdk');

var Connection = require('tedious').Connection;
var Request = require('tedious').Request;
var TYPES = require('tedious').TYPES; 

const client = new line.Client({
    channelAccessToken: process.env.ACCESS_TOKEN
});

const execute_sql = (context, query_type, id, query) => new Promise((resolve, reject) => {
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
    var sql_query = null;
    connection.on('connect', function(err) { 
        if (err) {
            console.log(err);
            reject(err);
            context.done();
        } else {
            console.log('connected');
            console.log('query type: %s', query_type);
            if (query_type == 'insert_record') {
                console.log('try insert');
                sql_query = "INSERT INTO UserInfo (UserID) VALUES (@ID);";
            } else if (query_type == 'update_phone_number') {
                console.log('try update phone num');
            } else if (query_type == 'update_specified_time') {
                console.log('try update time');
                sql_query = "UPDATE UserInfo SET SpecifiedTime=@Query, Specify=1 WHERE UserID=@ID;";
            } else if (query_type == 'abort_specify') {
                console.log('try abort');
                sql_query = "UPDATE UserInfo SET SpecifiedTime=@Query, Specify=0 WHERE UserID=@ID;";
            } else if (query_type == 'scan') {
                console.log('try scan');
                sql_query = "SELECT * FROM UserInfo WHERE UserID=@id;"
            } else {
                console.log('miss query: %s', query_type)
            }
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
            if (query_type == 'insert_record') {
                request.addParameter('ID', TYPES.NVarChar, id);
            } else if (query_type == 'update_phone_number') {
                request.addParameter('Query', TYPES.NVarChar, query);
                request.addParameter('ID', TYPES.NVarChar, id);
            } else if (query_type == 'update_specified_time') {
                request.addParameter('Query', TYPES.NVarChar, query);
                request.addParameter('ID', TYPES.NVarChar, id);
            } else if (query_type == 'abort_specify') {
                request.addParameter('Query', TYPES.NVarChar, query);
                request.addParameter('ID', TYPES.NVarChar, id);
            } else if (query_type == 'scan') {
                request.addParameter('ID', TYPES.NVarChar, id);
            }

            request.on('row', function(columns) {
                columns.forEach(function(column) {
                    if (column.value === null) {
                        console.log('NULL');
                    } else {
                        content.push(column.value);
                    }
                });
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





module.exports = function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');
    //console.log(req);
    if (req.query.message || (req.body && req.body.events)) {
        if (req.body && req.body.events[0]) {
            var query = req.body.events[0].message.text
            message = {
                type: "text",
                text: req.body.events[0].message.text
            }
            console.log('strat scan');
            check_database(context, req, query, do_next);
        }
        else {
            context.res = {
                status: 200,
                body: req.query.message
            };
        }
    }
    else {
        context.res = {
            status: 200,
            body: "Please check the query string in the request body"
        };
    };
};

function check_database (context, req, query) {
    execute_sql(context, 'scan', req.body.events[0].source.userId, query).then(ok => {
        do_next(context, ok, req, query)
    })

}

function do_next (context, record, req, query) {
    console.log('record');
    console.log(record);
    if (record.length) {
        if (record[1] == '0') {
            if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
                execute_sql(context, 'update_phone_number', record[0], query)
                message.text = '次から ' + query + ' にモーニングコールをかけるね！\nいつでも言ってくれれば24時間以内の希望の時間にモーニングコールをかけるよ！\n〇〇時〇〇分とか、〇時間〇分後みたいに教えてね！\n例① : 20時30分\n\n例② 6時間5分後'
            } else {
                message.text = '有効な電話番号を教えてね！'
            }
        } else {
            if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
                execute_sql(context, 'update_phone_number', record[0], query)
                message.text = '次から ' + query + ' にモーニングコールをかけるね！\n24時間以内の希望の時間にモーニングコールをかけるよ！\n〇時間〇分後みたいに教えてね！\n例① : 30分後\n\n例② 6時間5分後'
            } else if (query == query.match(/[0-9]+時間[0-9]+分後/)) {
                var hours = query.match(/[0-9]+/g)[0];
                var minutes = query.match(/[0-9]+/g)[1];
                var specified_time_utc = moment().utc().add(Number(hours), 'h').add(Number(minutes), 'm');
                execute_sql(context, 'update_specified_time', record[0], specified_time_utc.format("YYYY-MM-DD HH:mm:00"));
                message.text = record[1] + ' に' + String(specified_time_utc.add(9, 'h').format("MM月DD日HH時mm分")) + 'にモーニングコールをかけるね！\n\n取り消したいときは"キャンセル"とだけ送ってね！';
            } else if (query == query.match(/[0-9]+分後/)) {
                var minutes = query.match(/[0-9]+/g)[0];
                var specified_time_utc = moment().utc().add(Number(minutes), 'm');
                execute_sql(context, 'update_specified_time', record[0], specified_time_utc.format("YYYY-MM-DD HH:mm:00"));
                message.text = record[1] + ' に' + String(specified_time_utc.add(9, 'h').format("MM月DD日HH時mm分")) + 'にモーニングコールをかけるね！\n\n取り消したいときは"キャンセル"とだけ送ってね！';
            } else if (query == 'キャンセル') {
                execute_sql(context, 'abort_specify', record[0], '0');
                message.text = '取り消しました';
            }
        }
    } else {
        execute_sql(context, 'insert_record', req.body.events[0].source.userId, null);
        if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
            execute_sql(context, 'update_phone_number', req.body.events[0].source.userId, query)
            message.text = query + ' にモーニングコールをかけるね！\n24時間以内の希望の時間にモーニングコールをかけるよ！\n〇時間〇分後みたいに教えてね！\n例① : 30分後\n\n例② 6時間5分後'
        } else {
            message.text = 'まずは有効な電話番号を教えてね！'
        }
    }
    console.log(message);
    if (req.body.events[0].replyToken) {
        client.replyMessage(req.body.events[0].replyToken, message);
    }
}