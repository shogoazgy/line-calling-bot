const moment = require('moment');
const line = require('@line/bot-sdk');

var Connection = require('tedious').Connection;
var Request = require('tedious').Request;
var TYPES = require('tedious').TYPES; 

const client = new line.Client({
    channelAccessToken: process.env.ACCESS_TOKEN
});

function execute_sql(context, query_type, id, query) {
    var content = [];
    var config = {
        server: 'line-calling-database.database.windows.net',
        authentication: {
            type: 'default',
            options: {
                userName: 'shogo',           // 接続ユーザー名
                password: '5426laebi;' // 接続パスワード
            }
        },
        options: {
            encrypt: true,
            database: 'USER_DB'
        }
    };
    
    var connection = new Connection(config);
    connection.on('connect', function(err) { 
        if (err) {
            console.log(err);
            context.done();
        } else {
            console.log('connected');
            console.log(query_type);
            if (query_type == 'insert_record') {
                console.log('try insert');
                insert_record(id, query, exexsql);
            } else if (query_type == 'update_phone_number') {
                console.log('try updatep');
                update_table('phone_number', id, query, exexsql);
            } else if (query_type == 'update_specified_time') {
                console.log('try update time');
                update_table('specified_time', id, query, exexsql);
            } else if (query_type == 'abort_specify') {
                console.log('try abort');
                update_table('abort_specify', id, query, exexsql);
            } else if (query_type == 'scan') {
                console.log('try scan');
                scan(id, exexsql);
            } else {
                cconsole.log(query_type)
            }
        }
    });

    connection.on('end', function(err) {
        console.log("connection End");
        return content;
    });

    connection.connect();

    function update_table(type, id, query, callback) {
        var sql_query;
        switch (type) {
            case 'phone_number':
                sql_query = "UPDATE UserInfo SET TelphoneNumber=@Query WHERE UserID=@ID;";
                break;
            case 'specified_time':
                sql_query = "UPDATE UserInfo SET SpecifiedTime=@Query, Specify=1 WHERE UserID=@ID;";
                break;
            case 'abort_specify':
                sql_query = "UPDATE UserInfo SET SpecifiedTime=@Query, Specify=0 WHERE UserID=@ID;";
                break;
            default:
                console.log(type);
        }
        
        request = new Request(
            sql_query,
            function(err, rowCount, rows) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(rowCount + ' 行 更新されました。');
                };
                context.done();
        });
        request.addParameter('Query', TYPES.NVarChar, query);
        request.addParameter('ID', TYPES.NVarChar, id);
        request.on('requestCompleted', function () {
            connection.close();
        });
        callback(connection, request);
    }

    function insert_record(id, reply_token, callback) {
        var sql_query = "INSERT INTO UserInfo (UserID, ReplyToken) VALUES (@ID, @Reply_token);";
        console.log(sql_query);
        request = new Request(
            sql_query,
            function(err, rowCount, rows) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(rowCount + ' 行 追加されました。');
                };
                context.done();
        });
        request.addParameter('ID', TYPES.NVarChar, id);
        request.addParameter('Reply_token', TYPES.NVarChar, reply_token);
        request.on('requestCompleted', function () {
            connection.close();
        });
        callback(connection, request);
    }

    function scan(id, callback) {
        var sql_query = "SELECT * FROM UserInfo WHRER UserID=@id;"
        request = new Request(
            sql_query,
            function(err, rowCount, rows) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(rowCount + ' 行 読み込まれました');
                };
                context.done();
        });

        request.addParameter('ID', TYPES.NVarChar, id);

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
        callback(connection, request);
    }
}

function exexsql(connection, request) {
    connection.execSql(request);
}





module.exports = function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');
    console.log(req);
    if (req.query.message || (req.body && req.body.events)) {
        if (req.body && req.body.events[0]) {
            var query = req.body.events[0].message.text
            message = {
                type: "text",
                text: req.body.events[0].message.text
            }
            console.log('strat scan');
            var record = execute_sql(context, 'scan', req.body.events[0].source.userId, query);
            console.log('scaned');
            if (record) {
                if (record[1] == '0') {
                    if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
                        execute_sql(context, 'update_phone_number', record[0], query)
                        message.text = '次から ' + query + ' にモーニングコールをかけるね！\nいつでも言ってくれれば24時間以内の希望の時間にモーニングコールをかけるよ！\n〇〇時〇〇分とか、〇時間〇分後みたいに教えてね！\n例① : 20時30分\n\n例② 6時間5分後'
                    } else {
                        message.text = 'まずは有効な電話番号を教えてね！'
                    }
                } else {
                    if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
                        execute_sql(context, 'update_phone_number', record[0], query)
                        message.text = '次から ' + query + ' にモーニングコールをかけるね！\n電話番号を変えたい時は同じように11桁の数字で送ってね'
                    } else if (query == query.match(/[0-9]+時間[0-9]+分後/)) {
                        var hours = query.match(/[0-9]+/g)[0];
                        var minutes = query.match(/[0-9]+/g)[1];
                        var now = moment().format("YYYY-MM-DD HH:mm:00");
                        var specified_time = now.add(Number(hours), 'h').add(Number(minutes), 'm');
                        execute_sql(context, 'update_specified_time', record[0], specified_time);
                        message.text = record[1] + ' に' + String(specified_time.format("MM月DD日HH時mm分")) + 'にモーニングコールをかけるね！\n\n取り消したいときは"キャンセル"とだけ送ってね！';
                    } else if (query == query.match(/[0-9]+分後/)) {
                        var minutes = query.match(/[0-9]+/g)[0];
                        var now = moment().format("YYYY-MM-DD HH:mm:00");
                        var specified_time = now.add(Number(hours), 'h');
                        execute_sql(context, 'update_specified_time', record[0], specified_time);
                        message.text = record[1] + ' に' + String(specified_time.format("MM月DD日HH時mm分")) + 'にモーニングコールをかけるね！\n\n取り消したいときは"キャンセル"とだけ送ってね！';
                    } else if (query == 'キャンセル') {
                        execute_sql(context, 'abort_specify', record[0], '0');
                        message.text = '取り消しました';
                    }
                }
            } else {
                execute_sql(context, 'insert_record', req.body.events[0].source.userId, req.body.events[0].replyToken);
                if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
                    execute_sql(context, 'update_phone_number', req.body.events[0].source.userId, query)
                    message.text = '次から ' + query + ' にモーニングコールをかけるね！\n24時間以内の希望の時間にモーニングコールをかけるよ！\n〇時間〇分後みたいに教えてね！\n例① : 30分後\n\n例② 6時間5分後'
                } else {
                    message.text = 'まずは有効な電話番号を教えてね！'
                }
            }
            console.log(message);
            if (req.body.events[0].replyToken) {
                client.replyMessage(req.body.events[0].replyToken, message);
            }
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

function check_database (context, req, query, callback) {
    var record = execute_sql(context, 'scan', req.body.events[0].source.userId, query);
    console.log('record')
    console.log(record)
    callback
}

function do_next (context, record, req, query) {
    if (record) {
        if (record[1] == '0') {
            if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
                execute_sql(context, 'update_phone_number', record[0], query)
                message.text = '次から ' + query + ' にモーニングコールをかけるね！\nいつでも言ってくれれば24時間以内の希望の時間にモーニングコールをかけるよ！\n〇〇時〇〇分とか、〇時間〇分後みたいに教えてね！\n例① : 20時30分\n\n例② 6時間5分後'
            } else {
                message.text = 'まずは有効な電話番号を教えてね！'
            }
        } else {
            if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
                execute_sql(context, 'update_phone_number', record[0], query)
                message.text = '次から ' + query + ' にモーニングコールをかけるね！\n電話番号を変えたい時は同じように11桁の数字で送ってね'
            } else if (query == query.match(/[0-9]+時間[0-9]+分後/)) {
                var hours = query.match(/[0-9]+/g)[0];
                var minutes = query.match(/[0-9]+/g)[1];
                var now = moment().format("YYYY-MM-DD HH:mm:00");
                var specified_time = now.add(Number(hours), 'h').add(Number(minutes), 'm');
                execute_sql(context, 'update_specified_time', record[0], specified_time);
                message.text = record[1] + ' に' + String(specified_time.format("MM月DD日HH時mm分")) + 'にモーニングコールをかけるね！\n\n取り消したいときは"キャンセル"とだけ送ってね！';
            } else if (query == query.match(/[0-9]+分後/)) {
                var minutes = query.match(/[0-9]+/g)[0];
                var now = moment().format("YYYY-MM-DD HH:mm:00");
                var specified_time = now.add(Number(hours), 'h');
                execute_sql(context, 'update_specified_time', record[0], specified_time);
                message.text = record[1] + ' に' + String(specified_time.format("MM月DD日HH時mm分")) + 'にモーニングコールをかけるね！\n\n取り消したいときは"キャンセル"とだけ送ってね！';
            } else if (query == 'キャンセル') {
                execute_sql(context, 'abort_specify', record[0], '0');
                message.text = '取り消しました';
            }
        }
    } else {
        execute_sql(context, 'insert_record', req.body.events[0].source.userId, req.body.events[0].replyToken);
        if (isFinite(query) && Number.isInteger(Number(query)) && query.length == 11) {
            execute_sql(context, 'update_phone_number', req.body.events[0].source.userId, query)
            message.text = '次から ' + query + ' にモーニングコールをかけるね！\n24時間以内の希望の時間にモーニングコールをかけるよ！\n〇時間〇分後みたいに教えてね！\n例① : 30分後\n\n例② 6時間5分後'
        } else {
            message.text = 'まずは有効な電話番号を教えてね！'
        }
    }
    console.log(message);
    if (req.body.events[0].replyToken) {
        client.replyMessage(req.body.events[0].replyToken, message);
    }
}