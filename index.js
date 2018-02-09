const https = require('https');
const parse5 = require('parse5');
const cheerio = require('cheerio');
const cheerioTableparser = require('cheerio-tableparser');
const fs = require("fs");
const TelegramBot = require('node-telegram-bot-api');
var requestedClass = "-";
var token =  fs.readFileSync('token', 'utf8').trim();

function transpose(a) {
  var w = a.length || 0;
  var h = a[0] instanceof Array ? a[0].length : 0;
  if (h === 0 || w === 0) { return []; }
  var i, j, t = [];
  for(i=0; i<h; i++) {
    t[i] = [];
    for(j=0; j<w; j++) {
      t[i][j] = a[j][i];
    }
  }

  return t;
}

function deleteRow(arr, row) {
   arr = arr.slice(0); // make copy
   arr.splice(row - 1, 1);
   return arr;
}

var options = {
 hostname: 'www.istitutopilati.it'
 ,port: '443'
 ,path: '/notizie-video-sostituzioni.html'
 ,method: 'GET'
 ,headers: { 'Content-Type': 'application/html' },
 strictSSL: false
};

function toTitleCase(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

function beautifyArray(array) {
  var string = "";
  string += "Assente: " + toTitleCase(array[3]) + "\n";
  string += "Sostituto: " + toTitleCase(array[0]) + "\n";
  string += "Orario: " + array[1].replace(/\./i, ':').replace(/\./i, ':').replace(/-/i, ' - ') + "\n";
  //string += "Classe: " + array[2] + "\n";
  if (array[4])
    string += "Note: " + array[4] + "\n";

  //console.log(string);
  return string;
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

bot.onText(/\/assenze (.+)/, (msg, match) => {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message

  const chatId = msg.chat.id;
  requestedClass = match[1].toUpperCase();

  var response = "";
  var req = https.request(options, function(res) {
    var totalData = "";

    res.on('data', function (data) { totalData += data; });

    res.on('end', function () {
        //console.log(data); // I can't parse it because, it's a string. why?
        //console.log(totalData);
        // data = parse5.parse(totalData);
        // data = data.childNodes[1];
        // data = data.childNodes[2]; //body
        // data = data.childNodes; //div class=body
        // //console.log(totalData);

      $ = cheerio.load(totalData);
      cheerioTableparser($);
      var table = $(".textContent table").parsetable(false, false, true);
      //console.log(table);

      //console.log("******************************************************");
      if (table === undefined || table.length == 0) {
        console.log("Error");
        bot.sendMessage(chatId, "Errore nella richiesta al sito scolastico. Prova a visitarlo manualmente: https://www.istitutopilati.it/notizie-video-sostituzioni.html");
      } else {
        table = transpose(table);
        date = table[0][0];
        righe = table.length;
        var removed = 0;
        for (var i = 0; i < righe - removed; i++)
          if (!table[i][2] || table[i][2] == "CLASSE") {
            table.splice(i, 1);
            i--;
            removed++;
          }
        righe = table.length;
        var resultingTable = [];

        for (var row in table) //For each row
          if (table[row][2] == requestedClass) //If curent class = requested class
            resultingTable.push(table[row]);

        var numResults = 0;

        response = "Per il " + date + " nella classe " + requestedClass + " sono previste le seguenti assenze:\n";

        for (var j = 0; j < resultingTable.length; j++) { //For each column
          response += "\n" + beautifyArray(resultingTable[j]);
          numResults++;
        }

        if (numResults == 0)
          response = "Nessuna assenza prevista per il " + date + " nella la classe " + requestedClass + ".";

        bot.sendMessage(chatId, response);
      }
    });
  });

  req.on('error', function(e) {
    console.log('problem with request: ' + e.message);
  });

  req.write("");
  req.end();
});

bot.onText(/\/start/, (msg, match) => {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message

  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Bot avviato. Invia un messaggio come /assenze classe");
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  // send a message to the chat acknowledging receipt of their message
  //bot.sendMessage(chatId, 'Received your message');
});
