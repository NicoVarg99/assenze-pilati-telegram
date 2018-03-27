const https = require('https');
const fs = require("fs");
const TelegramBot = require('node-telegram-bot-api');
const timediff = require('timediff');
var requestedSubstitute = "-";
const token =  fs.readFileSync('token', 'utf8').trim();
var assenze; //Data or null
var errorMessage = "Errore nella richiesta al sito scolastico.\nProva a visitarlo manualmente: https://www.istitutopilati.it/gestione_sostituzioni/slideshow_fermo.php";

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

var connectionOptions = {
  hostname: 'www.istitutopilati.it',
  port: '443',
  path: '/gestione_sostituzioni/lista.json',
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  strictSSL: false
};

function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function msgAssenze(msg, match) {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message
  var requestedClass = match[1].toUpperCase();
  var resultingTable = [];

  if (!assenze) { //If no data is there, send an error message
    bot.sendMessage(msg.chat.id, errorMessage);
    return;
  }

  for (var i in assenze.values) //For each row
    if (assenze.values[i].Classe == requestedClass) //If curent class = requested class
      resultingTable.push(assenze.values[i]);

  var numResults = 0;
  response = "Per " + assenze.data_stringa + " nella classe " + requestedClass + " sono previste le seguenti assenze:\n";

  for (var i = 0; i < resultingTable.length; i++) { //For each match
    response += "\nAssente: " + resultingTable[i].Prof_Assente + "\n";
    response += "Sostituto: " + resultingTable[i].Prof_Sostituto + "\n";
    response += "Orario: " + resultingTable[i].Orario + "\n";
    if (resultingTable[i].Note != "")
      response += "Note: " + resultingTable[i].Note + "\n";
    numResults++;
  }

  if (numResults == 0)
    response = "Nessuna assenza prevista per " + assenze.data_stringa + " nella classe " + requestedClass + ".";

  bot.sendMessage(msg.chat.id, response);
}

function msgSostituto(msg, match) {
  //Searchs by substitute
  var requestedSubstitute = match[1];
  var resultingTable = [];

  if (!assenze) { //If no data is there, send an error message
    bot.sendMessage(msg.chat.id, errorMessage);
    return;
  }

  for (var i in assenze.values) //For each row
    if (assenze.values[i].Prof_Sostituto == requestedSubstitute) //If curent class = requested class
      resultingTable.push(assenze.values[i]);

  var numResults = 0;
  response = "Per " + assenze.data_stringa + " al docente " + requestedSubstitute + " sono assegnate le seguenti sostituzioni:\n";

  for (var i = 0; i < resultingTable.length; i++) { //For each match
    response += "\nAssente: " + resultingTable[i].Prof_Assente + "\n";
    response += "Orario: " + resultingTable[i].Orario + "\n";
    response += "Classe: " + resultingTable[i].Classe + "\n";
    if (resultingTable[i].Note != "")
      response += "Note: " + resultingTable[i].Note + "\n";
    numResults++;
  }

  if (numResults == 0)
     response = "Nessuna assenza assegnata per " + assenze.data_stringa + " al docente " + requestedSubstitute + ".";

  bot.sendMessage(msg.chat.id, response);
}

bot.onText(/^\/assenze$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Specifica una classe!\nEsempio: /assenze CLASSE");
});

bot.onText(/\/assenze.* (.+)/, msgAssenze);

bot.onText(/\/sostituto.* (.+)/, msgSostituto);
bot.onText(/^\/sostituto$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Specifica il nome!");
});

bot.onText(/\/start.*/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Bot avviato. Invia un messaggio come /assenze classe");
});
bot.onText(/^\/help$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Comandi disponibili:\n\n/assenze classe\n/sostituto nome");
});
bot.onText(/^ping$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "pong");
});

bot.onText(/.*/, (msg, match) => {
  var date = new Date().toISOString().
  replace(/T/, ' ').      // replace T with a space
  replace(/\..+/, '');

  var string = date + " - " + msg.from.id + " " + msg.from.first_name + " " + msg.from.last_name  + " " + msg.from.username + " on chat "  +  msg.chat.id + " - " + match;
  console.log(string);
  //bot.sendMessage(msg.chat.id, "Comandi disponibili:\n\n/assenze classe\n/sostituto nome");

  fs.appendFile('requests.log', string + '\n', function (err) {
  if (err) throw err;
  //console.log('Saved!');
  });

});

function fixDataFormat(data) { //Fixes conceptual errors in the remote JSON
  data.values = Array();

  for (var i in data.valori) {
    data.valori[i].id = i;
    data.values.push(data.valori[i]);
  }

  delete data.valori; //Remove valori
  return data;
}

function fetchData() {
  //Fetches new data - To be called at regular intervals or after requests
  var req = https.request(connectionOptions, function(res) {
    var totalData = "";

    res.on('data', function (data) {
      totalData += data;
    });

    res.on('end', function () {
      try {
        totalData = JSON.parse(totalData);
      } catch (e) {
        totalData = null;
        console.log(e instanceof SyntaxError); // true
        console.log(e.message);                // "missing ; before statement"
        console.log(e.name);                   // "SyntaxError"
        console.log(e.fileName);               // "Scratchpad/1"
        console.log(e.lineNumber);             // 1
        console.log(e.columnNumber);           // 4
        console.log(e.stack);                  // "@Scratchpad/1:2:3\n"
      }

      if (totalData)
        totalData = fixDataFormat(totalData);

      console.log(totalData);

      if (assenze) {
        //TODO: Fix comparison between timestamps
        // console.log("Current last update: " + assenze.timestamp);
        // console.log("Remote last update: " + totalData.timestamp);
        // console.log(timediff('2015-01-01', '2018-05-02 02:15:10.777', 's'));
        assenze = totalData;
      } else {
        //Do not compare
        assenze = totalData;
      }
    });
  });

  req.on('error', function(e) {
    console.log('Problem with request: ' + e.message);
    assenze = null;
  });

  req.write("");
  req.end();
}

fetchData(); //Fetch data immediately
setInterval(fetchData, 5*60*1000); //Fetch data every 5 minutes
